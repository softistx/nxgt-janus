import { describe, expect, it } from 'bun:test';
import { webhooks } from '../deliver';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { WebhookQueue } from '../queue/types';
import { crm, endpoint, eventOf } from './worker.fixtures';

// What the listener does with an event no endpoint takes: nothing at all.

describe('the listener, for an event no endpoint takes', () => {
	it('inserts nothing, and answers nothing', async () => {
		const memory = createMemoryWebhookQueue();
		let inserts = 0;
		const queue: WebhookQueue = {
			...memory,
			insertDeliveries: (...args) => {
				inserts += 1;
				return memory.insertDeliveries(...args);
			},
		};
		const listener = webhooks({
			endpoints: [{ ...crm, types: ['user.deleted'] }],
			queue,
			fetch: endpoint(200).fetch,
		});

		expect(listener(eventOf('user.created'))).toBeUndefined();
		await listener.close();
		expect(inserts).toBe(0);
	});
});
