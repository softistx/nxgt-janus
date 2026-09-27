import type { QueuedDelivery } from '../queue/types';
import { nameOf } from './guard';

/** The attempts under way: one per delivery claimed, until it settles. */
export interface Flights {
	/** Starts one attempt, and counts it in flight until it settles. */
	start(delivery: QueuedDelivery): void;
	/** How many attempts are in flight. */
	count(): number;
	/** Resolves once any attempt in flight settles. */
	any(): Promise<void>;
	/** Resolves once every attempt in flight settles. */
	all(): Promise<unknown>;
}

/** `freed` is told each time an attempt settles and frees its slot. */
export function flightsOf(
	attempt: (delivery: QueuedDelivery) => Promise<void>,
	freed: () => void,
): Flights {
	const sending = new Set<Promise<void>>();
	return {
		start(delivery) {
			const run = attempt(delivery)
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
					freed();
				});
			sending.add(run);
		},
		count: () => sending.size,
		any: () => Promise.race([...sending]),
		all: () => Promise.all([...sending]),
	};
}
