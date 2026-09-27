import { describe, expect, it } from 'bun:test';
import { webhooks } from './deliver';
import {
	endpoint,
	endpoints,
	eventOf,
	givingUps,
	held,
	pause,
	until,
	url,
	waitingIn,
} from './durable.fixtures';
import { verifyWebhook } from './payload';
import { createMemoryWebhookQueue } from './queue/memory';
import type { WebhookQueue } from './queue/types';
import { mintWebhookSecret } from './signature';

// What one process leaves the next: retries, waits, lapsed leases.

describe('webhooks({ queue })', () => {
	it('a retry failed by one process is sent by the next, signed with the secrets it runs with', async () => {
		// Closed as soon as the retry is scheduled, and not after a sleep: under
		// load, a sleep could outlast the 20 ms and let this process send the
		// retry itself. From the resolved write to close() only microtasks
		// run, so no timer can fire in between.
		const memory = createMemoryWebhookQueue();
		const scheduled = Promise.withResolvers<void>();
		const queue: WebhookQueue = {
			...memory,
			async scheduleRetry(...args) {
				const kept = await memory.scheduleRetry(...args);
				scheduled.resolve();
				return kept;
			},
		};
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
		await scheduled.promise;
		await a.close();
		expect(first.sent).toHaveLength(1);

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
});
