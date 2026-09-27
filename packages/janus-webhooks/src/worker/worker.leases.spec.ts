import { describe, expect, it } from 'bun:test';
import { webhooks } from '../deliver';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { WebhookQueue } from '../queue/types';
import {
	endpoint,
	endpoints,
	eventOf,
	givingUps,
	pause,
	short,
	until,
} from './worker.fixtures';

// How giving up holds a lease: reported once, by whoever holds it.

describe('giving up, under a lease', () => {
	it('reports once an attempt that spent nearly all its lease, and sends it no second time', async () => {
		// A fetch that ignores the abort: the attempt takes 1000 of the 1010 ms
		// of its lease, and onGivingUp 300 more.
		let sent = 0;
		const fetch = (async () => {
			sent += 1;
			await pause(1_000);
			return new Response(null, { status: 500 });
		}) as unknown as typeof globalThis.fetch;
		let reports = 0;
		const listener = webhooks({
			endpoints,
			queue: createMemoryWebhookQueue(),
			...short,
			retries: [],
			poll: '5ms',
			fetch,
			onGivingUp: async () => {
				reports += 1;
				await pause(300);
			},
		});

		await listener(eventOf());
		await pause(2_400);
		await listener.close();

		expect([sent, reports]).toEqual([1, 1]);
	});

	it('reports nothing when the lease is no longer held: whoever claims it next decides', async () => {
		const memory = createMemoryWebhookQueue();
		const queue: WebhookQueue = { ...memory, extendLease: async () => false };
		const { sent, fetch } = endpoint(500);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			queue,
			retries: [],
			fetch,
			onGivingUp,
		});

		await listener(eventOf());
		await until(() => sent() === 1);
		await pause(20);
		await listener.close();

		expect(given).toEqual([]);
	});

	it('extends the lease at once, then every third of it while onGivingUp runs', async () => {
		const memory = createMemoryWebhookQueue();
		const extended: number[] = [];
		const queue: WebhookQueue = {
			...memory,
			extendLease: (...args) => {
				extended.push(Date.now());
				return memory.extendLease(...args);
			},
		};
		let reported = false;
		const listener = webhooks({
			endpoints,
			queue,
			...short,
			retries: [],
			fetch: endpoint(500).fetch,
			onGivingUp: async () => {
				await pause(800);
				reported = true;
			},
		});

		await listener(eventOf());
		await until(() => reported);
		await listener.close();

		// At once, then at about 337 and 674 ms.
		expect(extended.length).toBeGreaterThanOrEqual(3);
	});
});
