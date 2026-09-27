import { describe, expect, it } from 'bun:test';
import { connectRedis } from '@nxgt/redis';
import { redisPerFile } from '../test/case';
import { createRedisWebhookQueue } from './queue';
import { at, eventOf, settled, T0 } from './queue.fixtures';

// What the adapter writes: its keys, their prefix, an insert all or none,
// and a failure remembered as it was written.

const served = redisPerFile();
const { withCase } = served;

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
		const redis = await connectRedis(
			`redis://${served.server.host}:${served.server.port}`,
		);
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
