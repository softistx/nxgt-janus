import { describe, expect, it } from 'bun:test';
import { redisPerFile } from '../test/case';
import { createRedisWebhookQueue } from './queue';
import { at, eventOf, settled } from './queue.fixtures';

// What the adapter reads back after Redis forgot its scripts, and from keys
// it did not write, or no longer holds: never an answer made up.

const served = redisPerFile();
const { withCase } = served;

describe('createRedisWebhookQueue(), beyond the port suite', () => {
	it('answers after Redis forgot its scripts: a restart, a failover, SCRIPT FLUSH', () =>
		withCase(async ({ redis, prefix }) => {
			const queue = createRedisWebhookQueue(redis, { prefix });
			await queue.insertDeliveries(eventOf(), ['crm'], at(0));

			await served.server.admin.send('SCRIPT', ['FLUSH']);

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
});
