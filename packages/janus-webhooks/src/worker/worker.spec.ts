import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { StoreFailure, type UserEvent } from '@nxgt/janus';
import { type Delivery, type GivingUp, webhooks } from '../deliver';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { QueuedDelivery, WebhookQueue } from '../queue/types';
import { mintWebhookSecret } from '../signature';

// The worker's edges: what a slow report, a queue that fails half-way, or a
// queue that answers nonsense does to a delivery.

const secret = mintWebhookSecret();
const url = 'https://hooks.example.test/janus';
const crm = { id: 'crm', url, secrets: [secret] as [string] };
const endpoints = [crm];
/** The shortest lease the wiring takes over a 10 ms timeout. */
const short = { timeout: '10ms', lease: '1010ms' } as const;

let sequence = 0;
function eventOf(type: UserEvent['type'] = 'user.created'): UserEvent {
	sequence += 1;
	return Object.freeze({
		id: `0199a0db-f800-7000-8000-${String(sequence).padStart(12, '0')}`,
		type,
		occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
		userId: '0199a0db-f800-7000-8000-000000000002',
		userType: 'user',
	});
}

/** A fetch answering each request with the next of `answers`, then the last. */
function endpoint(...answers: number[]) {
	let sent = 0;
	const fetch = (async () => {
		sent += 1;
		const answer = answers[Math.min(sent, answers.length) - 1] ?? 200;
		return new Response(null, { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent: () => sent, fetch };
}

/** A fetch whose answers the spec gives by hand, one per request, in order. */
function held() {
	const answers: ((status: number) => void)[] = [];
	const fetch = (() =>
		new Promise<Response>((resolve) => {
			answers.push((status) => resolve(new Response(null, { status })));
		})) as unknown as typeof globalThis.fetch;
	return { answers, fetch };
}

async function until(check: () => boolean, tries = 400): Promise<void> {
	for (let n = 0; !check(); n++) {
		if (n > tries) throw new Error('never happened');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function givingUps() {
	const given: [Delivery, GivingUp][] = [];
	return {
		given,
		onGivingUp: (delivery: Delivery, reason: GivingUp) => {
			given.push([delivery, reason]);
		},
	};
}

const warnings: (Error & { code?: string })[] = [];
const onWarning = (warning: Error) => warnings.push(warning);
process.on('warning', onWarning);
afterEach(() => {
	warnings.length = 0;
});
afterAll(() => {
	process.off('warning', onWarning);
});
const queueFailures = () =>
	warnings.filter((one) => one.code === 'JANUS_WEBHOOK_QUEUE_FAILED');

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

describe('close(), without a queue, every slot busy', () => {
	it('still sends the first attempt of every event it took before close()', async () => {
		const { answers, fetch } = held();
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			concurrency: 1,
			fetch,
			onGivingUp,
		});

		listener(eventOf());
		listener(eventOf());
		const closing = listener.close();
		await until(() => answers.length === 1);
		answers[0]?.(200);
		await until(() => answers.length === 2);
		answers[1]?.(200);
		await closing;

		expect(given).toEqual([]);
	});
});
