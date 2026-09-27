import type { WebhookQueue, WebhookQueueMethod } from '../queue/types';

export type { WebhookQueueMethod };

/**
 * How the suite makes one queue method fail **the way its database fails**.
 *
 * Optional, and **its absence is reported, never passed over**: without it
 * the outage cases are recorded as skipped, with the reason *"faults not
 * provided: the outage invariant is not proven for this adapter"*.
 */
export interface WebhookQueueFaults {
	/**
	 * From now until the queue is closed, every call to `method` fails as the
	 * database would — and only `method`: the others keep answering, so a case
	 * can read back what a rejected insert left. Not a decorator that throws in
	 * front of the adapter: that proves the decorator, not the adapter's
	 * translation of a failure.
	 */
	fail(method: WebhookQueueMethod): Promise<void>;
}

/** One queue, opened for one case. */
export interface OpenedWebhookQueue {
	/** Empty: every case inserts what it claims. */
	readonly queue: WebhookQueue;
	readonly faults?: WebhookQueueFaults;
	/** Called after the case, pass or fail. */
	close?(): Promise<void>;
}

/**
 * Opens a **fresh, empty** queue — once per case, so no case sees another's
 * deliveries.
 */
export interface WebhookQueueHarness {
	open(): Promise<OpenedWebhookQueue>;
}

/** What a case runs against. */
export interface WebhookQueueContext {
	readonly queue: WebhookQueue;
	readonly faults: WebhookQueueFaults | null;
}

/**
 * One conformance case, as **data**: `run` throws on failure and resolves on
 * success, so a case runs under `bun test`, vitest, jest, or a plain loop.
 */
export interface WebhookQueueCase {
	/** Stable: `'lease.staleLease'`. What `skip` names. */
	readonly id: string;
	readonly group: 'queue' | 'lease' | 'orphans' | 'outage';
	/** A sentence: what the queue must do. */
	readonly name: string;
	/** What the case cannot run without; absent, it is skipped with a reason. */
	readonly needs?: 'faults';
	run(context: WebhookQueueContext): Promise<void>;
}
