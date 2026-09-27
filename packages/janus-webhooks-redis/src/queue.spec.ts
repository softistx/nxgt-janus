import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mintId, type UserEvent } from '@nxgt/janus';
import { mintWebhookSecret, webhooks } from '@nxgt/janus-webhooks';
import { connectRedis } from '@nxgt/redis';
import { openCase, type RedisCase } from '../test/case';
import { startRedis, type TestServer } from '../test/server';
import { createRedisWebhookQueue } from './queue';

let server: TestServer;

beforeAll(async () => {
	server = await startRedis();
}, 300_000);

afterAll(async () => {
	await server.stop();
});

/** Runs `body` against a case of its own, closed whatever happens. */
async function withCase(body: (test: RedisCase) => Promise<void>) {
	const test = await openCase(server);
	try {
		await body(test);
	} finally {
		await test.close();
	}
}

const T0 = Date.UTC(2026, 8, 26, 12);
const at = (ms: number) => new Date(T0 + ms);

function eventOf(): UserEvent {
	return {
		id: mintId(T0),
		type: 'user.created',
		occurredAt: at(-1_234),
		userId: mintId(T0),
		userType: 'user',
	};
}

/** What a call settled with: its answer, or the error it rejected with. */
const settled = (promise: Promise<unknown>) =>
	promise.then(
		(answer) => ({ answer }),
		(error: unknown) => ({ error }),
	);

describe('createRedisWebhookQueue(), beyond the port suite', () => {
	it('keeps a delivery as a hash, due in its endpoint’s sorted set, its endpoint in the set of endpoints', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			const id = `${event.id}:user.created:crm`;
			const send = (command: string, args: string[]) =>
				redis.client.send(command, args);

			expect(await send('HGETALL', [`${prefix}delivery:${id}`])).toEqual({
				eventId: event.id,
				type: 'user.created',
				occurredAt: String(T0 - 1_234),
				userId: event.userId,
				userType: 'user',
				endpoint: 'crm',
				attempts: '0',
				lease: '',
			});
			expect(await send('ZSCORE', [`${prefix}due:crm`, id]).then(Number)).toBe(
				T0,
			);
			expect(await send('SMEMBERS', [`${prefix}endpoints`])).toEqual(['crm']);

			const [claimed] = await queue.claimDeliveries(
				['crm'],
				at(0),
				at(30_000),
				1,
			);
			if (claimed === undefined) throw new Error('nothing claimed');
			expect(await send('ZSCORE', [`${prefix}due:crm`, id]).then(Number)).toBe(
				T0 + 30_000,
			);

			await queue.deleteDelivery(claimed.id, claimed.lease);
			expect(await send('KEYS', [`${prefix}*`])).toEqual([]);
		}));

	it('writes under janus:webhooks: when no prefix is given', async () => {
		// The default user may write anywhere: the keys it leaves are removed.
		const redis = await connectRedis(`redis://${server.host}:${server.port}`);
		try {
			const queue = createRedisWebhookQueue(redis);
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			const keys = (await redis.client.send('KEYS', [
				'janus:webhooks:*',
			])) as string[];
			await redis.client.send('DEL', keys);
			expect(keys.sort()).toEqual([
				`janus:webhooks:delivery:${event.id}:user.created:crm`,
				'janus:webhooks:due:crm',
				'janus:webhooks:endpoints',
			]);
		} finally {
			await redis.close();
		}
	});

	it('answers after Redis forgot its scripts: a restart, a failover, SCRIPT FLUSH', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			await queue.insertDeliveries(eventOf(), ['crm'], at(0));

			await server.admin.send('SCRIPT', ['FLUSH']);

			expect(
				await queue.claimDeliveries(['crm'], at(0), at(30_000), 10),
			).toHaveLength(1);
		}));

	it('drops a member whose hash is gone, and claims past it', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const lost = eventOf();
			const kept = eventOf();
			await queue.insertDeliveries(lost, ['crm'], at(0));
			await queue.insertDeliveries(kept, ['crm'], at(1));
			await redis.client.send('DEL', [
				`${prefix}delivery:${lost.id}:user.created:crm`,
			]);

			const claimed = await queue.claimDeliveries(
				['crm'],
				at(10),
				at(30_000),
				1,
			);
			expect(claimed.map((one) => one.event.id)).toEqual([kept.id]);
			expect(await redis.client.send('ZCARD', [`${prefix}due:crm`])).toBe(1);
		}));

	it('leaves nothing of an insert a key of the wrong type refused half-way', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			await redis.client.send('SET', [`${prefix}due:b`, 'not a sorted set']);

			const outcome = await settled(
				queue.insertDeliveries(eventOf(), ['a', 'b'], at(0)),
			);
			expect(outcome).toMatchObject({
				error: { name: 'StoreFailure', operation: 'insertDeliveries' },
			});
			expect(await redis.client.send('KEYS', [`${prefix}*`])).toEqual([
				`${prefix}due:b`,
			]);
		}));

	it('fails, never answers [], on a delivery of its prefix it did not write', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			await redis.client.send('HSET', [
				`${prefix}delivery:${event.id}:user.created:crm`,
				'occurredAt',
				'yesterday',
			]);

			const outcome = await settled(
				queue.claimDeliveries(['crm'], at(0), at(30_000), 10),
			);
			expect(outcome).toMatchObject({
				error: {
					name: 'StoreFailure',
					code: 'STORE_FAILED',
					operation: 'claimDeliveries',
					message:
						'webhookQueue.claimDeliveries: a reply that is not a date in `occurredAt` — a key under the prefix this adapter did not write',
				},
			});
		}));

	it('fails on a type janus never sends, rather than answering it', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			await redis.client.send('HSET', [
				`${prefix}delivery:${event.id}:user.created:crm`,
				'type',
				'user.signedIn',
			]);

			const outcome = await settled(
				queue.claimDeliveries(['crm'], at(0), at(30_000), 10),
			);
			expect(outcome).toMatchObject({
				error: {
					message:
						'webhookQueue.claimDeliveries: a reply that is not a user event type — a key under the prefix this adapter did not write',
				},
			});
		}));

	it('remembers a failure with neither a status nor an error as it was written', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			await queue.insertDeliveries(eventOf(), ['crm'], at(0));
			const [claimed] = await queue.claimDeliveries(['crm'], at(0), at(1), 1);
			if (claimed === undefined) throw new Error('nothing claimed');
			const nothing = { status: null, error: null };
			await queue.scheduleRetry(claimed.id, claimed.lease, at(0), nothing);

			const [retried] = await queue.claimDeliveries(['crm'], at(0), at(1), 1);
			expect(retried?.failed).toEqual(nothing);
		}));
});

describe('webhooks({ queue: createRedisWebhookQueue(…) })', () => {
	it('hands a retry a first process left to a second', () =>
		withCase(async ({ redis, prefix }) => {
			const endpoints = [
				{
					id: 'crm',
					url: 'https://hooks.example.test/janus',
					secrets: [mintWebhookSecret()] as [string],
				},
			];
			const answers = [500, 200];
			let sent = 0;
			const fetch = (async () => {
				const status = answers[sent] ?? 200;
				sent += 1;
				return new Response(null, { status });
			}) as unknown as typeof globalThis.fetch;
			const options = {
				endpoints,
				retries: ['50ms'] as const,
				poll: '10ms',
				fetch,
			} as const;

			const first = webhooks({
				...options,
				queue: createRedisWebhookQueue(redis, { prefix }),
			});
			await first(eventOf());
			for (let n = 0; sent < 1; n++) {
				if (n > 200) throw new Error('never sent');
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			await first.close();

			const second = webhooks({
				...options,
				queue: createRedisWebhookQueue(redis, { prefix }),
			});
			for (let n = 0; sent < 2; n++) {
				if (n > 400) throw new Error('never retried');
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			await second.close();

			expect(sent).toBe(2);
			// Delivered: nothing is left under the prefix.
			for (let n = 0; n < 100; n++) {
				const keys = await redis.client.send('KEYS', [`${prefix}*`]);
				if ((keys as unknown[]).length === 0) break;
				await new Promise((resolve) => setTimeout(resolve, 5));
			}
			expect(await redis.client.send('KEYS', [`${prefix}*`])).toEqual([]);
		}));
});
