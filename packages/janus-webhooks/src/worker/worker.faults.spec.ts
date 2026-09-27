import { describe, expect, it } from 'bun:test';
import { StoreFailure } from '@nxgt/janus';
import { webhooks } from '../deliver';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { QueuedDelivery, WebhookQueue } from '../queue/types';
import {
	endpoint,
	endpoints,
	eventOf,
	givingUps,
	pause,
	short,
	until,
	watchQueueFailures,
} from './worker.fixtures';

// What a queue that fails or answers nonsense costs a delivery.

const queueFailures = watchQueueFailures();

describe('a queue that fails after a request', () => {
	it('warns once when deleteDelivery throws, and sends the delivery again once its lease lapses', async () => {
		const memory = createMemoryWebhookQueue();
		let failures = 1;
		const queue: WebhookQueue = {
			...memory,
			deleteDelivery: async (...args) => {
				if (failures-- > 0) throw new StoreFailure('down');
				return memory.deleteDelivery(...args);
			},
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({
			endpoints,
			queue,
			...short,
			poll: '5ms',
			fetch,
		});

		await listener(eventOf());
		await until(() => sent() === 2);
		await pause(50);
		await listener.close();

		expect(sent()).toBe(2);
		expect(queueFailures().map((one) => one.message)).toEqual([
			expect.stringContaining(
				'the queue failed on deleteDelivery: StoreFailure',
			),
		]);
	});

	it('warns once when scheduleRetry throws, and sends the delivery again once its lease lapses', async () => {
		const memory = createMemoryWebhookQueue();
		let failures = 1;
		const queue: WebhookQueue = {
			...memory,
			scheduleRetry: async (...args) => {
				if (failures-- > 0) throw new StoreFailure('down');
				return memory.scheduleRetry(...args);
			},
		};
		const { sent, fetch } = endpoint(500, 200);
		const listener = webhooks({
			endpoints,
			queue,
			...short,
			retries: ['1h'],
			poll: '5ms',
			fetch,
		});

		await listener(eventOf());
		await until(() => sent() === 2);
		await pause(50);
		await listener.close();

		expect(sent()).toBe(2);
		expect(queueFailures().map((one) => one.message)).toEqual([
			expect.stringContaining(
				'the queue failed on scheduleRetry: StoreFailure',
			),
		]);
	});
});

describe('a queue that answers nonsense', () => {
	it('takes a claim answered with no list as a failure, and claims again', async () => {
		const memory = createMemoryWebhookQueue();
		let nonsense = 1;
		const queue: WebhookQueue = {
			...memory,
			claimDeliveries: async (...args) =>
				nonsense-- > 0
					? (null as unknown as readonly QueuedDelivery[])
					: memory.claimDeliveries(...args),
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({ endpoints, queue, poll: '5ms', fetch });

		await listener(eventOf());
		await until(() => sent() === 1);
		await listener.close();

		expect(queueFailures().map((one) => one.message)).toEqual([
			expect.stringContaining('the queue failed on claimDeliveries: TypeError'),
		]);
	});

	it('counts a delivery whose event cannot be sent as a failed attempt, and gives it up past the schedule', async () => {
		const memory = createMemoryWebhookQueue();
		const broken = (one: QueuedDelivery): QueuedDelivery => ({
			...one,
			event: { ...one.event, occurredAt: new Date(Number.NaN) },
		});
		const queue: WebhookQueue = {
			...memory,
			claimDeliveries: async (...args) =>
				(await memory.claimDeliveries(...args)).map(broken),
		};
		const { sent, fetch } = endpoint(200);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			queue,
			retries: ['5ms'],
			fetch,
			onGivingUp,
		});

		await listener(eventOf());
		await until(() => given.length === 1);
		await listener.close();

		expect(sent()).toBe(0);
		expect(
			given.map(([delivery, reason]) => [delivery.attempts, reason]),
		).toEqual([
			[2, { why: 'retriesRanOut', status: null, error: 'RangeError' }],
		]);
		expect(queueFailures().map((one) => one.message)).toEqual([
			'webhooks: the queue answered a delivery that cannot be sent (RangeError) — counted as a failed attempt',
			'webhooks: the queue answered a delivery that cannot be sent (RangeError) — counted as a failed attempt',
		]);
	});
});
