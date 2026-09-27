import { describe, expect, it } from 'bun:test';
import { mintWebhookSecret, webhooks } from '@nxgt/janus-webhooks';
import { redisPerFile } from '../test/case';
import { createRedisWebhookQueue } from './queue';
import { eventOf } from './queue.fixtures';

const { withCase } = redisPerFile();

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
