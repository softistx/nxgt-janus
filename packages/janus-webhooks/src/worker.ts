import type { UserEvent } from '@nxgt/janus';
import type { Delivery, GivingUp } from './deliver';
import { LONGEST, type Settings } from './options';
import { bodyOf } from './payload';
import { createMemoryWebhookQueue } from './queue/memory';
import type {
	QueuedDelivery,
	WebhookQueue,
	WebhookQueueMethod,
} from './queue/types';
import { post } from './request';

/** The last instant a `Date` holds: a claim there takes every delivery. */
const END_OF_TIME = new Date(8.64e15);
/** How often, at most, a queue is asked for deliveries to endpoints no longer configured. */
const ORPHAN_SWEEP = 60_000;
/** How many of them one sweep takes. */
const ORPHAN_BATCH = 100;
/** The longest wait after a queue failure: it doubles from `poll` up to this. */
const BACKOFF_MAX = 30_000;

/** How a delivery given up is reported: `reporterOf`'s, which never rejects. */
export type Report = (delivery: Delivery, reason: GivingUp) => Promise<void>;

/** What sends the deliveries of one `webhooks()`. */
export interface Worker {
	/**
	 * Inserts one delivery per endpoint, due now, then wakes the pump without
	 * waiting for it. Rejects when the queue does: nothing else holds them.
	 */
	accept(event: UserEvent, endpoints: readonly string[]): Promise<void>;
	/**
	 * Stops claiming, and waits for the inserts, requests and reports under
	 * way. Without a queue of the caller's, then gives up every delivery still
	 * waiting, as `closed`; with one, leaves them to the next process.
	 */
	close(): Promise<void>;
}

/**
 * Starts sending the deliveries a queue holds: **one pump at a time**, which
 * claims what is due — up to `concurrency` requests at once — and sends each.
 * Woken by an insert, by a retry of this process's falling due, and, with a
 * queue of the caller's, by a poll for what other processes left due or let
 * a lease lapse on.
 *
 * Every timer is unref'd: none holds the process open. A request under way
 * does, so the first attempt of an event is never lost to a script's exit.
 */
export function startWorker(settings: Settings, report: Report): Worker {
	const durable = settings.queue !== null;
	const queue = settings.queue ?? createMemoryWebhookQueue();
	const { leaseMs, pollMs } = settings;
	const endpoints = settings.targets.map((one) => one.endpoint);
	const guard = guardOf();

	const inserting = new Set<Promise<void>>();
	const sending = new Set<Promise<void>>();
	const reminders = new Set<ReturnType<typeof setTimeout>>();
	/** `close()` was called: no timer is set any more. */
	let stopping = false;
	/** Nothing is claimed any more. */
	let stopped = false;
	let pumping: Promise<void> | null = null;
	let again = false;
	let dueAtLeast = 0;
	let saturated = false;
	let rotation = 0;
	let backoff = 0;
	let tick: ReturnType<typeof setTimeout> | undefined;

	/** Claims what is due and starts sending it. `true` when it took all it could. */
	const pumpOnce = async (): Promise<boolean> => {
		const free = settings.concurrency - sending.size;
		if (free <= 0) {
			saturated = true;
			return false;
		}
		// A reminder names the instant its retry is due: claimed as of then,
		// so a timer that fires a millisecond early misses nothing.
		const now = Math.max(Date.now(), dueAtLeast);
		dueAtLeast = 0;
		// Rotated at each claim, so one endpoint's backlog cannot take every
		// slot from the others.
		const first = rotation++ % endpoints.length;
		const order = [...endpoints.slice(first), ...endpoints.slice(0, first)];
		const batch = await claimed(guard, 'claimDeliveries', () =>
			queue.claimDeliveries(
				order,
				new Date(now),
				new Date(now + leaseMs),
				free,
			),
		);
		if (batch === null) {
			backoff = Math.min(Math.max(backoff * 2, pollMs), BACKOFF_MAX);
			return false;
		}
		backoff = 0;
		for (const delivery of batch) start(delivery);
		saturated = batch.length >= free;
		return saturated;
	};

	const wake = (at = 0): void => {
		if (stopped) return;
		dueAtLeast = Math.max(dueAtLeast, at);
		if (pumping !== null) {
			again = true;
			return;
		}
		pumping = (async () => {
			for (;;) {
				again = false;
				const full = await pumpOnce();
				if (stopped || !(full || again)) break;
			}
			arm();
		})().finally(() => {
			pumping = null;
		});
	};

	/** The next wake with no event to cause one: the poll, or a queue failure's backoff. */
	const arm = (): void => {
		clearTimeout(tick);
		if (stopping || (!durable && backoff === 0)) return;
		const ms = backoff > 0 ? backoff : pollMs * (0.8 + Math.random() * 0.4);
		tick = setTimeout(() => wake(), ms);
		tick.unref?.();
	};

	const sender = senderOf({
		queue,
		settings,
		report,
		guard,
		// Without a queue of the caller's, a failure after close() has nowhere
		// to wait: it is given up. With one, it waits there for the next process.
		retries: () => durable || !stopping,
		remind: (dueAt) => {
			if (stopping) return;
			const timer = setTimeout(
				() => {
					reminders.delete(timer);
					wake(dueAt);
				},
				Math.min(Math.max(dueAt - Date.now(), 0), LONGEST),
			);
			timer.unref?.();
			reminders.add(timer);
		},
	});

	const start = (delivery: QueuedDelivery): void => {
		const run = sender
			.attempt(delivery)
			// A delivery the queue answered malformed: its lease lapses, and
			// the next claim answers it again — the queue's to fix.
			.catch((failure: unknown) => guard.warn('claimDeliveries', failure))
			.then(() => {
				sending.delete(run);
				if (saturated) wake();
			});
		sending.add(run);
	};

	/** Gives up the deliveries waiting for an endpoint no configuration has any more. */
	const sweep = async (): Promise<void> => {
		const now = Date.now();
		const orphans = await claimed(guard, 'claimOrphanedDeliveries', () =>
			queue.claimOrphanedDeliveries(
				endpoints,
				new Date(now - settings.orphanGraceMs),
				new Date(now + leaseMs),
				ORPHAN_BATCH,
			),
		);
		for (const orphan of orphans ?? []) {
			await sender.abandon(orphan, 'endpointRemoved');
		}
	};

	let sweeping: Promise<void> = Promise.resolve();
	const sweeper = durable
		? setInterval(
				() => {
					sweeping = sweeping.then(sweep);
				},
				Math.min(ORPHAN_SWEEP, Math.max(settings.orphanGraceMs, pollMs)),
			)
		: undefined;
	sweeper?.unref?.();
	arm();

	return {
		accept(event, to) {
			const run = (async () => {
				await queue.insertDeliveries(event, to, new Date());
				wake();
			})();
			inserting.add(run);
			const done = () => inserting.delete(run);
			run.then(done, done);
			return run;
		},

		async close() {
			stopping = true;
			for (const timer of reminders) clearTimeout(timer);
			reminders.clear();
			clearTimeout(tick);
			clearInterval(sweeper);
			// Each insert wakes the pump as it lands: an event that came before
			// close() still gets its first attempt.
			await Promise.allSettled([...inserting]);
			stopped = true;
			await pumping;
			await sweeping;
			await Promise.all([...sending]);
			if (durable) return;
			// The drain's claim is no attempt: abandon counts it out.
			const waiting = await claimed(guard, 'claimDeliveries', () =>
				queue.claimDeliveries(
					endpoints,
					END_OF_TIME,
					END_OF_TIME,
					Number.MAX_SAFE_INTEGER,
				),
			);
			await Promise.all(
				(waiting ?? []).map((one) => sender.abandon(one, 'closed')),
			);
		},
	};
}

/** What one delivery claimed becomes: delivered, retried, or given up. */
function senderOf(context: {
	readonly queue: WebhookQueue;
	readonly settings: Settings;
	readonly report: Report;
	readonly guard: Guard;
	/** Whether a failure with a retry left is retried, or given up as `closed`. */
	readonly retries: () => boolean;
	/** Called with the instant a retry scheduled falls due. */
	readonly remind: (dueAt: number) => void;
}) {
	const { queue, settings, report, guard } = context;
	const urlOf = (endpoint: string): string | null =>
		settings.targets.find((one) => one.endpoint === endpoint)?.url ?? null;

	/**
	 * Reports, then removes: a crash between the two reports it twice, where
	 * the other order could lose the report. The lease is kept alive while
	 * `onGivingUp` runs, so no other process takes the delivery meanwhile.
	 */
	const giveUp = async (
		claimed: QueuedDelivery,
		attempts: number,
		reason: GivingUp,
	): Promise<void> => {
		const { id, lease, event, endpoint } = claimed;
		const heartbeat = setInterval(() => {
			const until = new Date(Date.now() + settings.leaseMs);
			void guard.call('extendLease', () => queue.extendLease(id, lease, until));
		}, settings.leaseMs / 3);
		heartbeat.unref?.();
		try {
			const url = urlOf(endpoint);
			await report({ event, url, endpoint, attempts }, reason);
		} finally {
			clearInterval(heartbeat);
		}
		await guard.call('deleteDelivery', () => queue.deleteDelivery(id, lease));
	};

	/** Gives up a delivery claimed without an attempt: its claim is not counted. */
	const abandon = (claimed: QueuedDelivery, why: GivingUp['why']) =>
		giveUp(claimed, claimed.attempts - 1, {
			why,
			...(claimed.failed ?? { status: null, error: null }),
		});

	/** One attempt: then delivered, retried, or given up. */
	const attempt = async (claimed: QueuedDelivery): Promise<void> => {
		const target = settings.targets.find(
			(one) => one.endpoint === claimed.endpoint,
		);
		if (target === undefined) return abandon(claimed, 'endpointRemoved');
		const { event, id, lease } = claimed;
		const body = bodyOf(event);
		const { send, timeoutMs } = settings;
		const failed = await post(target, event, body, send, timeoutMs);
		if (failed === null) {
			await guard.call('deleteDelivery', () => queue.deleteDelivery(id, lease));
			return;
		}
		const delay = settings.delays[claimed.attempts - 1];
		if (delay === undefined || !context.retries()) {
			const why = delay === undefined ? 'retriesRanOut' : 'closed';
			return giveUp(claimed, claimed.attempts, { why, ...failed });
		}
		// From the end of the attempt, as the schedule says.
		const dueAt = Date.now() + delay;
		const kept = await guard.call('scheduleRetry', () =>
			queue.scheduleRetry(id, lease, new Date(dueAt), failed),
		);
		if (kept === true) context.remind(dueAt);
	};

	return { attempt, abandon };
}

type Guard = ReturnType<typeof guardOf>;

/**
 * Calls the queue, turning a failure into `null` and a warning — **one per
 * outage**, not one per call: the pump retries, and a warning each time
 * would bury the first. The next answer ends the outage.
 */
function guardOf() {
	let down = false;
	const warn = (operation: WebhookQueueMethod, failure: unknown): void => {
		if (down) return;
		down = true;
		process.emitWarning(
			`webhooks: the queue failed on ${operation}: ${failure instanceof Error ? failure.name : typeof failure} — deliveries wait in it until it answers again`,
			{ code: 'JANUS_WEBHOOK_QUEUE_FAILED' },
		);
	};
	return {
		warn,
		async call<T>(
			operation: WebhookQueueMethod,
			run: () => Promise<T>,
		): Promise<T | null> {
			try {
				const answer = await run();
				down = false;
				return answer;
			} catch (failure) {
				warn(operation, failure);
				return null;
			}
		},
	};
}

/** A claim's answer through the guard — and anything but a list is a failure. */
function claimed(
	guard: Guard,
	operation: 'claimDeliveries' | 'claimOrphanedDeliveries',
	claim: () => Promise<readonly QueuedDelivery[]>,
): Promise<readonly QueuedDelivery[] | null> {
	return guard.call(operation, async () => {
		const answer = await claim();
		if (!Array.isArray(answer)) {
			throw new TypeError('the queue answered a claim with no list');
		}
		return answer;
	});
}
