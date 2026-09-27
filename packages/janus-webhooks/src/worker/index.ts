import type { UserEvent } from '@nxgt/janus';
import type { Settings } from '../options';
import { createMemoryWebhookQueue } from '../queue/memory';
import type { Report } from '../report';
import { abandonWaiting, flush } from './drain';
import { flightsOf } from './flights';
import { guardOf } from './guard';
import { pumpOf } from './pump';
import { remindersOf } from './reminders';
import { senderOf } from './sender';
import { NO_SWEEPER, startSweeper } from './sweeper';

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
	const reminders = remindersOf((at) => pump.wake(at));
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
			reminders.add(dueAt);
		},
	});
	const flights = flightsOf(sender.attempt, () => pump.freed());
	const pump = pumpOf({
		queue,
		settings,
		guard,
		durable,
		inFlight: flights.count,
		start: flights.start,
	});
	const sweeper = durable
		? startSweeper({ queue, settings, guard, sender, keys })
		: NO_SWEEPER;

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
			reminders.clear();
			sweeper.stop();
			// With a queue, nothing more is claimed from here: an insert that
			// lands, or a slot that frees, wakes a stopped pump in vain.
			if (durable) await pump.stop();
			await Promise.allSettled([...inserting]);
			if (!durable) await flush(pump, flights, Date.now());
			await pump.stop();
			await sweeper.settled();
			await flights.all();
			if (durable) return;
			await abandonWaiting({ queue, guard, sender, keys });
		},
	};
}
