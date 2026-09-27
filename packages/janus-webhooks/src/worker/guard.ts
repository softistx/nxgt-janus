import type { QueuedDelivery, WebhookQueueMethod } from '../queue/types';

export type Guard = ReturnType<typeof guardOf>;

/**
 * Calls the queue, turning a failure into `null` and a warning — **one per
 * outage**, not one per call: the pump retries, and a warning each time
 * would bury the first. The next answer ends the outage.
 */
export function guardOf() {
	let down = false;
	return {
		async call<T>(
			operation: WebhookQueueMethod,
			run: () => Promise<T>,
		): Promise<T | null> {
			try {
				const answer = await run();
				down = false;
				return answer;
			} catch (failure) {
				if (!down) {
					down = true;
					process.emitWarning(
						`webhooks: the queue failed on ${operation}: ${nameOf(failure)} — deliveries wait in it until it answers again`,
						{ code: 'JANUS_WEBHOOK_QUEUE_FAILED' },
					);
				}
				return null;
			}
		},
	};
}

/** A claim's answer through the guard — and anything but a list is a failure. */
export function claimed(
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

/** What a warning may say of a failure: its name, never its message. */
export function nameOf(failure: unknown): string {
	return failure instanceof Error ? failure.name : typeof failure;
}
