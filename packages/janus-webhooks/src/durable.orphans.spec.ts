import { describe, expect, it } from 'bun:test';
import { webhooks } from './deliver';
import {
	endpoint,
	endpoints,
	eventOf,
	givingUps,
	pause,
	until,
	waitingIn,
} from './durable.fixtures';
import { createMemoryWebhookQueue } from './queue/memory';

// What becomes of the deliveries of an endpoint no longer configured.

describe('an endpoint no longer configured', () => {
	it('has its deliveries given up as endpointRemoved once overdue by orphanGrace, and not before', async () => {
		const queue = createMemoryWebhookQueue();
		const overdue = eventOf();
		const recent = eventOf();
		const now = Date.now();
		await queue.insertDeliveries(overdue, ['gone'], new Date(now - 1_000));
		await queue.insertDeliveries(recent, ['gone'], new Date(now + 60_000));

		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			queue,
			orphanGrace: '20ms',
			poll: '5ms',
			fetch: endpoint(200).fetch,
			onGivingUp,
		});
		await until(() => given.length === 1);
		await pause(60);
		await listener.close();

		expect(given).toEqual([
			[
				{ event: overdue, url: null, endpoint: 'gone', attempts: 0 },
				{ why: 'endpointRemoved', status: null, error: null },
			],
		]);
		expect(
			(await waitingIn(queue, ['gone'])).map((one) => one.event.id),
		).toEqual([recent.id]);
	});
});
