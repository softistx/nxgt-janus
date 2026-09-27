import type { WebhookQueue } from '../queue/types';
import type { Flights } from './flights';
import { claimed, type Guard } from './guard';
import type { Pump } from './pump';
import type { Sender } from './sender';

/** The last instant a `Date` holds: a claim there takes every delivery. */
const END_OF_TIME = new Date(8.64e15);

/**
 * Without a queue of the caller's: sends everything due at `at` — the
 * first attempts, above all — slot by slot, until a claim finds nothing
 * and no request is left in flight.
 */
export async function flush(
	pump: Pump,
	flights: Flights,
	at: number,
): Promise<void> {
	pump.hold(at);
	for (;;) {
		pump.wake();
		const claimedNothing = await pump.idle();
		if (flights.count() === 0) {
			if (claimedNothing) return;
			continue;
		}
		await flights.any();
	}
}

/**
 * Without a queue of the caller's, once nothing is in flight: gives up, as
 * `closed`, every delivery still waiting. The drain's claim is no attempt:
 * abandon counts it out.
 */
export async function abandonWaiting(context: {
	readonly queue: WebhookQueue;
	readonly guard: Guard;
	readonly sender: Sender;
	readonly keys: readonly string[];
}): Promise<void> {
	const { queue, guard, sender, keys } = context;
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
}
