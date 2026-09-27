import { describe, expect, it } from 'bun:test';
import { StoreFailure } from '@nxgt/janus';
import { webhooks } from './deliver';
import {
	endpoint,
	endpoints,
	eventOf,
	pause,
	until,
	watchWarnings,
} from './durable.fixtures';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';

// What a queue that fails costs: one warning per outage, and nothing lost.

describe('a queue that fails', () => {
	const warnings = watchWarnings();

	it('is one JANUS_WEBHOOK_QUEUE_FAILED warning per outage, never the URL; what waits is sent once it answers', async () => {
		const memory = createMemoryWebhookQueue();
		let down = true;
		const queue: WebhookQueue = {
			...memory,
			claimDeliveries: async (...args) => {
				if (down) throw new StoreFailure('webhookQueue.claimDeliveries: down');
				return memory.claimDeliveries(...args);
			},
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({ endpoints, queue, poll: '5ms', fetch });

		await listener(eventOf());
		await pause(60);
		expect(sent).toEqual([]);
		const failed = warnings.filter(
			(one) =>
				(one as Error & { code?: string }).code ===
				'JANUS_WEBHOOK_QUEUE_FAILED',
		);
		expect(failed).toHaveLength(1);
		expect(failed[0]?.message).toContain('claimDeliveries: StoreFailure');
		expect(failed[0]?.message).not.toContain('hooks.example.test');

		down = false;
		await until(() => sent.length === 1);
		await listener.close();
	});

	it('names an endpoint given up as removed by its id, the only thing the queue knows of it', async () => {
		const queue = createMemoryWebhookQueue();
		await queue.insertDeliveries(eventOf(), ['gone'], new Date(0));
		const listener = webhooks({
			endpoints,
			queue,
			orphanGrace: '5ms',
			poll: '5ms',
			fetch: endpoint(200).fetch,
		});
		await until(() => warnings.length === 1);
		await listener.close();

		expect(warnings[0]?.message).toContain(
			'to endpoint gone after 0 attempts (endpointRemoved, no answer)',
		);
	});
});
