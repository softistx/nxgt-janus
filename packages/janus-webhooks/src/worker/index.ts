import type { UserEvent } from '@nxgt/janus';
import { LONGEST, type Settings } from '../options';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { QueuedDelivery } from '../queue/types';
import type { Report } from '../report';
import { claimed, guardOf, nameOf } from './guard';
import { pumpOf } from './pump';
import { senderOf } from './sender';

/** The last instant a `Date` holds: a claim there takes every delivery. */
const END_OF_TIME = new Date(8.64e15);
/** How often, at most, a queue is asked for deliveries to endpoints no longer configured. */
const ORPHAN_SWEEP = 60_000;
/** How many of them one sweep takes. */
const ORPHAN_BATCH = 100;

/** What sends the deliveries of one `webhooks()`. */
export interface Worker {
	/**
	 * Inserts one delivery per endpoint key, due now, then wakes the pump
	 * without waiting for it. Rejects when the queue does: nothing else holds
	 * them.
	 */
	accept(event: UserEvent, keys: readonly string[]): Promise<void>;
	/**
	 * Waits for the inserts under way, then for the requests and reports.
	 * Without a queue of the caller's, first sends every delivery due by then
	 * — the first attempt of each event already accepted — then gives up what
	 * still waits, as `closed`. With one, claims nothing more and leaves what
	 * waits to the next process.
	 */
	close(): Promise<void>;
}

/**
 * Starts sending the deliveries a queue holds: a pump claims what is due,
 * and a sender makes each an attempt — delivered, retried, or given up.
 * Woken by an insert, by a retry of this process's falling due, and, with a
 * queue of the caller's, by a poll for what other processes left due or let
 * a lease lapse on; with one, it also gives up the orphans.
 *
 * Every timer is unref'd: none holds the process open. A request under way
 * does, so the first attempt of an event is never lost to a script's exit.
 */
export function startWorker(settings: Settings, report: Report): Worker {
	const durable = settings.queue !== null;
	const queue = settings.queue ?? createMemoryWebhookQueue();
	const keys = settings.targets.map((one) => one.key);
	const guard = guardOf();
	const inserting = new Set<Promise<void>>();
	const sending = new Set<Promise<void>>();
	const reminders = new Set<ReturnType<typeof setTimeout>>();
	/** `close()` was called: no timer is set, and no failure retried from memory. */
	let closing = false;

	const sender = senderOf({
		queue,
		settings,
		report,
		guard,
		// Without a queue of the caller's, a failure after close() has nowhere
		// to wait: it is given up. With one, it waits there for the next process.
		retries: () => durable || !closing,
		remind: (dueAt) => {
			if (closing) return;
			const timer = setTimeout(
				() => {
					reminders.delete(timer);
					pump.wake(dueAt);
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
			// A net: the sender answers every failure it knows. What is left is
			// a delivery too broken to be handled; its lease lapses.
			.catch((failure: unknown) =>
				process.emitWarning(
					`webhooks: the queue answered a delivery that cannot be handled (${nameOf(failure)})`,
					{ code: 'JANUS_WEBHOOK_QUEUE_FAILED' },
				),
			)
			.then(() => {
				sending.delete(run);
				pump.freed();
			});
		sending.add(run);
	};

	const pump = pumpOf({
		queue,
		settings,
		guard,
		durable,
		inFlight: () => sending.size,
		start,
	});

	/**
	 * Gives up the deliveries waiting for an endpoint no configuration has
	 * any more, one after the other: each one's lease is extended when its
	 * turn comes, before it is reported.
	 */
	const sweep = async (): Promise<void> => {
		const now = Date.now();
		const orphans = await claimed(guard, 'claimOrphanedDeliveries', () =>
			queue.claimOrphanedDeliveries(
				keys,
				new Date(now - settings.orphanGraceMs),
				new Date(now + settings.leaseMs),
				ORPHAN_BATCH,
			),
		);
		for (const orphan of orphans ?? []) {
			await sender.abandon(orphan, 'endpointRemoved');
		}
	};

	let sweeping: Promise<void> = Promise.resolve();
	const every = Math.min(
		ORPHAN_SWEEP,
		Math.max(settings.orphanGraceMs, settings.pollMs),
	);
	const sweeper = durable
		? setInterval(() => {
				sweeping = sweeping.then(sweep);
			}, every)
		: undefined;
	sweeper?.unref?.();

	/**
	 * Without a queue of the caller's: sends everything due at `at` — the
	 * first attempts, above all — slot by slot, until a claim finds nothing
	 * and no request is left in flight.
	 */
	const flush = async (at: number): Promise<void> => {
		pump.hold(at);
		for (;;) {
			pump.wake();
			const claimedNothing = await pump.idle();
			if (sending.size === 0) {
				if (claimedNothing) return;
				continue;
			}
			await Promise.race([...sending]);
		}
	};

	return {
		accept(event, to) {
			const run = (async () => {
				await queue.insertDeliveries(event, to, new Date());
				pump.wake();
			})();
			inserting.add(run);
			const done = () => inserting.delete(run);
			run.then(done, done);
			return run;
		},

		async close() {
			closing = true;
			pump.quiet();
			for (const timer of reminders) clearTimeout(timer);
			reminders.clear();
			clearInterval(sweeper);
			// With a queue, nothing more is claimed from here: an insert that
			// lands, or a slot that frees, wakes a stopped pump in vain.
			if (durable) await pump.stop();
			await Promise.allSettled([...inserting]);
			if (!durable) await flush(Date.now());
			await pump.stop();
			await sweeping;
			await Promise.all([...sending]);
			if (durable) return;
			// The drain's claim is no attempt: abandon counts it out.
			const waiting = await claimed(guard, 'claimDeliveries', () =>
				queue.claimDeliveries(
					keys,
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
