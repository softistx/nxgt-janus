import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mintId, type UserEvent } from '@nxgt/janus';
import { openCase, type RedisCase } from '../test/case';
import { startRedis, type TestServer } from '../test/server';
import { createRedisWebhookQueue } from './queue';

// The edges of what the adapter writes and claims: what it refuses before
// any I/O, what it reads back, and what a claim never answers twice.

let server: TestServer;

beforeAll(async () => {
	server = await startRedis();
}, 300_000);

afterAll(async () => {
	await server.stop();
});

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

function eventOf(overrides: Partial<UserEvent> = {}): UserEvent {
	return {
		id: mintId(T0),
		type: 'user.created',
		occurredAt: at(-1_234),
		userId: mintId(T0),
		userType: 'user',
		...overrides,
	};
}

/** The error `promise` rejected with; a failure when it resolves. */
const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => {
			throw new Error('resolved');
		},
		(error: unknown) => error,
	);

describe('dates', () => {
	it('reads back an event that occurred before 1970', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf({ occurredAt: new Date(-5) });
			await queue.insertDeliveries(event, ['crm'], at(0));

			const [claimed] = await queue.claimDeliveries(['crm'], at(0), at(1), 1);
			expect(claimed?.event.occurredAt).toEqual(new Date(-5));
		}));

	it('refuses an Invalid Date before any I/O, and writes nothing', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const invalid = new Date(Number.NaN);

			const occurred = await rejection(
				queue.insertDeliveries(
					eventOf({ occurredAt: invalid }),
					['crm'],
					at(0),
				),
			);
			expect(occurred).toBeInstanceOf(TypeError);
			expect((occurred as Error).message).toBe(
				'webhookQueue.insertDeliveries: event.occurredAt is a valid Date',
			);
			expect(
				(
					(await rejection(
						queue.insertDeliveries(eventOf(), ['crm'], invalid),
					)) as Error
				).message,
			).toBe('webhookQueue.insertDeliveries: dueAt is a valid Date');
			expect(
				(
					(await rejection(
						queue.claimDeliveries(['crm'], invalid, at(1), 1),
					)) as Error
				).message,
			).toBe('webhookQueue.claimDeliveries: now is a valid Date');
			expect(await redis.client.send('KEYS', [`${prefix}*`])).toEqual([]);
		}));
});

describe('limit', () => {
	for (const limit of [2.5, Number.POSITIVE_INFINITY, Number.NaN, -1]) {
		it(`refuses a limit of ${limit} before any I/O`, () =>
			withCase(async ({ redis, prefix }) => {
				const queue = createRedisWebhookQueue(redis, { prefix });
				for (const [operation, claim] of [
					[
						'claimDeliveries',
						queue.claimDeliveries(['crm'], at(0), at(1), limit),
					],
					[
						'claimOrphanedDeliveries',
						queue.claimOrphanedDeliveries([], at(0), at(1), limit),
					],
				] as const) {
					const error = await rejection(claim);
					expect(error).toBeInstanceOf(TypeError);
					expect((error as Error).message).toBe(
						`webhookQueue.${operation}: limit is a whole number of deliveries, 0 or more`,
					);
				}
			}));
	}
});

describe('a claim, never answering one delivery twice', () => {
	it('walks past a stale member without claiming again what a lease already past left in range', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const first = eventOf();
			const second = eventOf();
			await queue.insertDeliveries(first, ['crm'], at(0));
			await queue.insertDeliveries(second, ['crm'], at(1));
			// A member whose hash is gone, due before both.
			await redis.client.send('ZADD', [
				`${prefix}due:crm`,
				String(T0 - 10),
				'lost',
			]);

			// A lease that ends before now leaves each claimed delivery due.
			const claimed = await queue.claimDeliveries(['crm'], at(10), at(-1), 2);
			expect(claimed.map((one) => one.event.id)).toEqual([first.id, second.id]);
		}));

	it('walks an endpoint named twice once', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			await queue.insertDeliveries(eventOf(), ['crm'], at(0));

			const claimed = await queue.claimDeliveries(
				['crm', 'crm'],
				at(0),
				at(-1),
				10,
			);
			expect(claimed).toHaveLength(1);
		}));

	it('removes an endpoint from the set of endpoints when stale members were all its due set held', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			await redis.client.send('DEL', [
				`${prefix}delivery:${event.id}:user.created:crm`,
			]);

			expect(await queue.claimDeliveries(['crm'], at(0), at(1), 10)).toEqual(
				[],
			);
			expect(await redis.client.send('KEYS', [`${prefix}*`])).toEqual([]);
		}));
});

describe('leases and failures', () => {
	it("never takes '' for a lease: a released or never-claimed delivery is not held", () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			const id = `${event.id}:user.created:crm`;

			expect(await queue.extendLease(id, '', at(1))).toBe(false);
			expect(await queue.deleteDelivery(id, '')).toBe(false);

			const [claimed] = await queue.claimDeliveries(['crm'], at(0), at(1), 1);
			if (claimed === undefined) throw new Error('nothing claimed');
			await queue.scheduleRetry(id, claimed.lease, at(5), {
				status: 503,
				error: null,
			});
			expect(
				await queue.scheduleRetry(id, '', at(0), { status: 500, error: null }),
			).toBe(false);
			expect(await queue.deleteDelivery(id, '')).toBe(false);
		}));

	it('fails on a hash holding a status without an error', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const event = eventOf();
			await queue.insertDeliveries(event, ['crm'], at(0));
			await redis.client.send('HSET', [
				`${prefix}delivery:${event.id}:user.created:crm`,
				'status',
				'503',
			]);

			const error = await rejection(
				queue.claimDeliveries(['crm'], at(0), at(1), 1),
			);
			expect(error).toMatchObject({
				name: 'StoreFailure',
				message:
					'webhookQueue.claimDeliveries: a reply that is not a hash with `error` — a key under the prefix this adapter did not write',
			});
		}));

	it('refuses a status that is not a whole number before any I/O', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			const error = await rejection(
				queue.scheduleRetry('x', 'lease', at(0), { status: 5.5, error: null }),
			);
			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toBe(
				'webhookQueue.scheduleRetry: failed.status is null or a whole number',
			);
		}));
});
