import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import {
	createMemoryStores,
	janus,
	StoreFailure,
	scryptHasher,
	type UserEvent,
} from '@nxgt/janus';
import { z } from 'zod';
import { type Delivery, type GivingUp, webhooks } from './deliver';
import { verifyWebhook } from './payload';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';
import { mintWebhookSecret } from './signature';

// Every spec here passes a queue: the semantics of one that outlives the
// process. `deliver.spec.ts` holds those of 0.1.0, without one.

const secret = mintWebhookSecret();
const url = 'https://hooks.example.test/janus?token=sentinel';
const endpoints = [{ id: 'crm', url, secrets: [secret] as [string] }];

let sequence = 0;
/** A new event each time: a queue holds one delivery per event and endpoint. */
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
	const sent: RequestInit[] = [];
	const fetch = (async (_: string, init: RequestInit) => {
		sent.push(init);
		const answer = answers[Math.min(sent.length, answers.length) - 1] ?? 200;
		return new Response(null, { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent, fetch };
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

async function until(check: () => boolean): Promise<void> {
	for (let tries = 0; !check(); tries++) {
		if (tries > 200) throw new Error('never happened');
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

/** Every delivery the queue still holds, claimed at the end of time. */
const waitingIn = (queue: WebhookQueue, ids: readonly string[]) =>
	queue.claimDeliveries(ids, new Date(8.64e15), new Date(8.64e15), 1_000);

describe('webhooks({ queue })', () => {
	it('resolves the listener once the deliveries are in the queue, and sends at once', async () => {
		const queue = createMemoryWebhookQueue();
		const { sent, fetch } = endpoint(204);
		const listener = webhooks({ endpoints, queue, fetch });

		const inserted = listener(eventOf());
		expect(inserted).toBeInstanceOf(Promise);
		await inserted;
		await until(() => sent.length === 1);
		await listener.close();

		expect(await waitingIn(queue, ['crm'])).toEqual([]);
	});

	it('rejects the listener when the insert fails, and janus warns with the event id', async () => {
		const queue: WebhookQueue = {
			...createMemoryWebhookQueue(),
			insertDeliveries: async () => {
				throw new StoreFailure('webhookQueue.insertDeliveries: down');
			},
		};
		const listener = webhooks({ endpoints, queue, fetch: endpoint().fetch });

		const refused = await (listener(eventOf()) as Promise<void>).then(
			() => null,
			(failure: unknown) => failure,
		);
		expect(refused).toBeInstanceOf(StoreFailure);

		const warnings: Error[] = [];
		const onWarning = (warning: Error) => warnings.push(warning);
		process.on('warning', onWarning);
		try {
			const auth = janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				store: createMemoryStores(),
				hasher: scryptHasher(),
				events: listener,
			});
			const user = await auth.create({ email: 'ada@example.test' });
			await until(() => warnings.length === 1);
			expect((warnings[0] as Error & { code?: string }).code).toBe(
				'JANUS_EVENT_FAILED',
			);
			expect(user.email).toBe('ada@example.test');
		} finally {
			process.off('warning', onWarning);
		}
		await listener.close();
	});

	it('holds only the endpoint id: never the URL, never a secret', async () => {
		const inserts: unknown[][] = [];
		const memory = createMemoryWebhookQueue();
		const queue: WebhookQueue = {
			...memory,
			insertDeliveries: (...args) => {
				inserts.push(args);
				return memory.insertDeliveries(...args);
			},
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({
			endpoints: [{ url, secrets: [secret] }],
			queue,
			fetch,
		});

		await listener(eventOf());
		await until(() => sent.length === 1);
		await listener.close();

		const [, ids] = inserts[0] as [UserEvent, string[]];
		expect(ids).toHaveLength(1);
		expect(ids[0]).toMatch(/^[0-9a-f]{32}$/);
		expect(JSON.stringify(inserts)).not.toContain('sentinel');
		expect(JSON.stringify(inserts)).not.toContain(secret.slice(6));
	});

	it('a retry failed by one process is sent by the next, signed with the secrets it runs with', async () => {
		const queue = createMemoryWebhookQueue();
		const first = endpoint(500);
		const gaveUp = givingUps();
		const a = webhooks({
			endpoints,
			queue,
			retries: ['20ms'],
			fetch: first.fetch,
			onGivingUp: gaveUp.onGivingUp,
		});
		const event = eventOf();
		await a(event);
		await until(() => first.sent.length === 1);
		await pause(5);
		await a.close();

		const next = mintWebhookSecret();
		const second = endpoint(200);
		const b = webhooks({
			endpoints: [{ id: 'crm', url, secrets: [next] }],
			queue,
			retries: ['20ms'],
			poll: '5ms',
			fetch: second.fetch,
			onGivingUp: gaveUp.onGivingUp,
		});
		await until(() => second.sent.length === 1);
		await b.close();

		expect(gaveUp.given).toEqual([]);
		const init = second.sent[0] as RequestInit;
		const headers = init.headers as Record<string, string>;
		expect(
			verifyWebhook({ secrets: [next], headers, body: String(init.body) }),
		).toEqual(event);
		expect(await waitingIn(queue, ['crm'])).toEqual([]);
	});

	it('on close, gives up nothing: a failure in flight is scheduled, what waits stays for the next process', async () => {
		const queue = createMemoryWebhookQueue();
		const { answers, fetch } = held();
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			queue,
			retries: ['1h'],
			fetch,
			onGivingUp,
		});

		await listener(eventOf());
		await until(() => answers.length === 1);
		const closing = listener.close();
		// An event after close() is still inserted, and not sent from here.
		await listener(eventOf('user.deleted'));
		answers[0]?.(500);
		await closing;
		await pause(10);

		expect(given).toEqual([]);
		expect(answers).toHaveLength(1);
		// Earliest due first: the new event now, the retry in an hour.
		const waiting = await waitingIn(queue, ['crm']);
		expect(
			waiting.map((one) => [one.event.type, one.attempts - 1, one.failed]),
		).toEqual([
			['user.deleted', 0, null],
			['user.created', 1, { status: 500, error: null }],
		]);
	});

	it('on close, claims nothing more while an insert under way lands', async () => {
		const shared = createMemoryWebhookQueue();
		// Another process's backlog, due now.
		for (const type of ['user.created', 'user.deleted'] as const) {
			await shared.insertDeliveries(eventOf(type), ['crm'], new Date());
		}
		const queue: WebhookQueue = {
			...shared,
			async insertDeliveries(...args) {
				await pause(50);
				return shared.insertDeliveries(...args);
			},
		};
		const { sent, fetch } = endpoint(200);
		const listener = webhooks({ endpoints, queue, poll: '1h', fetch });

		const inserted = listener(eventOf());
		await listener.close();
		await inserted;
		await pause(20);

		expect(sent).toHaveLength(0);
		// The backlog and the event just accepted wait for the next process.
		expect(await waitingIn(shared, ['crm'])).toHaveLength(3);
	});

	it('takes back a delivery whose process died mid-request once its lease lapses — the crash costs an attempt', async () => {
		const queue = createMemoryWebhookQueue();
		const event = eventOf();
		const now = Date.now();
		await queue.insertDeliveries(event, ['crm'], new Date(now));
		// The dead process's claim: it never answers, and its lease lapses.
		await queue.claimDeliveries(['crm'], new Date(now), new Date(now + 20), 1);

		const { sent, fetch } = endpoint(503);
		const { given, onGivingUp } = givingUps();
		const listener = webhooks({
			endpoints,
			queue,
			retries: ['5ms'],
			poll: '5ms',
			fetch,
			onGivingUp,
		});
		await until(() => given.length === 1);
		await listener.close();

		expect(sent).toHaveLength(1);
		expect(given).toEqual([
			[
				{ event, url, endpoint: 'crm', attempts: 2 },
				{ why: 'retriesRanOut', status: 503, error: null },
			],
		]);
	});

	it('sends no more than concurrency requests at once', async () => {
		const queue = createMemoryWebhookQueue();
		const { answers, fetch } = held();
		const listener = webhooks({ endpoints, queue, concurrency: 2, fetch });

		for (let n = 0; n < 5; n += 1) await listener(eventOf());
		await pause(20);
		expect(answers).toHaveLength(2);

		for (let sent = 0; sent < 5; sent += 1) {
			await until(() => answers.length > sent);
			answers[sent]?.(200);
		}
		await until(() => answers.length === 5);
		await listener.close();
		expect(await waitingIn(queue, ['crm'])).toEqual([]);
	});
});

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

describe('a queue that fails', () => {
	const warnings: Error[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});

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

describe('webhooks({ queue, … }) refuses, as wiring', () => {
	const queue = createMemoryWebhookQueue();

	it.each([
		[
			'a queue missing a method',
			{ endpoints, queue: { ...queue, extendLease: undefined } },
			'webhooks: queue is not a WebhookQueue — it has no extendLease',
		],
		[
			'a concurrency that is not a whole number',
			{ endpoints, concurrency: '4' },
			'webhooks: concurrency is a whole number of requests, 1 or more',
		],
		[
			'no concurrency at all',
			{ endpoints, concurrency: 0 },
			'webhooks: concurrency is a whole number of requests, 1 or more',
		],
		[
			'a lease less than timeout plus 1s',
			{ endpoints, queue, timeout: '10s', lease: '10999ms' },
			'webhooks: lease must be at least timeout plus 1s',
		],
		[
			'a timeout whose default lease would wait past 24 days',
			{ endpoints, queue, timeout: '2147483000ms' },
			'webhooks: timeout is too long — the default lease, timeout plus 30s, waits at most 24 days',
		],
		[
			'a poll without a queue',
			{ endpoints, poll: '1s' },
			'webhooks: poll and orphanGrace take effect with a queue only',
		],
		[
			'an orphanGrace without a queue',
			{ endpoints, orphanGrace: '1h' },
			'webhooks: poll and orphanGrace take effect with a queue only',
		],
		[
			'an id that is a URL',
			{ endpoints: [{ id: url, url, secrets: [secret] }] },
			"webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'",
		],
		[
			'an id that is not a string',
			{ endpoints: [{ id: 1, url, secrets: [secret] }] },
			"webhooks: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'",
		],
		[
			'two endpoints with one id',
			{
				endpoints: [
					{ id: 'crm', url, secrets: [secret] },
					{ id: 'crm', url: 'https://other.example.test', secrets: [secret] },
				],
			},
			'webhooks: two endpoints have one id',
		],
		[
			'two endpoints with one URL and no id, with a queue',
			{
				endpoints: [
					{ url, secrets: [secret] },
					{ url, secrets: [secret] },
				],
				queue,
			},
			'webhooks: two endpoints have one id',
		],
	])('%s', (_, options, message) => {
		expect(() => webhooks(options as never)).toThrow(message);
	});

	it('takes two endpoints with one URL without a queue, as 0.1.0 did', () => {
		expect(() =>
			webhooks({
				endpoints: [
					{ url, secrets: [secret] },
					{ url, secrets: [secret] },
				],
			}),
		).not.toThrow();
	});

	it('takes, without a queue, an id written that is the position of another', () => {
		// Without a queue a position is a key no id written can take.
		expect(() =>
			webhooks({
				endpoints: [
					{ id: '1', url, secrets: [secret] },
					{ url: 'https://other.example.test', secrets: [secret] },
				],
			}),
		).not.toThrow();
	});

	it('takes a lease of exactly timeout plus 1s', () => {
		expect(() =>
			webhooks({ endpoints, queue, timeout: '10s', lease: '11s' }),
		).not.toThrow();
	});
});
