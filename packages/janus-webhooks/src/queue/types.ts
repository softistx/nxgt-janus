import type { UserEvent } from '@nxgt/janus';
import type { Failure } from '../request';

/**
 * One delivery as the queue holds it: the event, and the id of the endpoint
 * it goes to. **Never a secret, never the URL** — a query string may hold a
 * token of the receiver's, and the secrets are read from the running
 * configuration at each attempt.
 */
export interface QueuedDelivery {
	/**
	 * `${event.id}:${event.type}:${endpoint}`: one per event and endpoint, so
	 * inserting the same event twice is a retry of the insert, not a second
	 * delivery. The type is in it because an event rebuilt by hand may reuse
	 * an id under another type — `janus` never does — and is another event.
	 */
	readonly id: string;
	readonly event: UserEvent;
	/** The endpoint's id, looked up in the running configuration when it is sent. */
	readonly endpoint: string;
	/**
	 * The claims so far, this one included. Counted when claimed, not when
	 * answered: a process that died mid-request has still spent its attempt,
	 * so a delivery that crashes every process it reaches runs out.
	 */
	readonly attempts: number;
	/** What the last failed attempt got, or `null` before any failed. */
	readonly failed: Failure | null;
	/** This claim's token: every write after the claim names it. */
	readonly lease: string;
}

/**
 * Where deliveries wait, between the event and their last attempt: the port
 * a durable queue implements, so a delivery waiting for a retry outlives the
 * process that failed it.
 *
 * The rules, checked by `@nxgt/janus-webhooks/conformance`:
 *
 * 1. **An absence is `[]` or `false`. A failure throws** — `StoreFailure`
 *    from `@nxgt/janus`, with `cause`, by preference. Never
 *    `catch { return [] }`: a queue that answers "nothing due" for an outage
 *    holds every delivery back without a word.
 * 2. Each method is **atomic**. Two claims running at once never answer the
 *    same delivery.
 * 3. **Bytes round-trip**: the event's fields exactly as written, dates to
 *    the millisecond.
 * 4. **Time is passed in.** A queue never reads a clock of its own: a lease
 *    is compared with the caller's `now`, so every process of one queue
 *    agrees on what is due.
 *
 * A claimed delivery is not removed: it is hidden until its lease runs out,
 * then due again. A process that dies mid-request therefore loses nothing —
 * the next claim after `leaseUntil` takes it back.
 */
export interface WebhookQueue {
	/**
	 * Inserts one delivery of `event` per endpoint, due at `dueAt`, all or
	 * none. Answers how many were new: an id already held is kept as it is.
	 */
	insertDeliveries(
		event: UserEvent,
		endpoints: readonly string[],
		dueAt: Date,
	): Promise<number>;
	/**
	 * Claims up to `limit` deliveries to `endpoints` that are due at `now`,
	 * walking the endpoints in the order given and each one's deliveries
	 * earliest first. Each claimed is hidden until `leaseUntil`, counts one
	 * more attempt, and carries a fresh lease. `[]` when none is due.
	 */
	claimDeliveries(
		endpoints: readonly string[],
		now: Date,
		leaseUntil: Date,
		limit: number,
	): Promise<readonly QueuedDelivery[]>;
	/**
	 * As `claimDeliveries`, for the endpoints **not** in `known`, and only
	 * the deliveries due at `dueBefore` or earlier: those no configuration
	 * sends any more. `[]` when there is none.
	 */
	claimOrphanedDeliveries(
		known: readonly string[],
		dueBefore: Date,
		leaseUntil: Date,
		limit: number,
	): Promise<readonly QueuedDelivery[]>;
	/** Moves the lease's end to `until`. `false` when the lease is no longer held. */
	extendLease(id: string, lease: string, until: Date): Promise<boolean>;
	/**
	 * Makes the delivery due again at `dueAt`, remembering `failed`, and
	 * releases the lease. `false` when the lease is no longer held.
	 */
	scheduleRetry(
		id: string,
		lease: string,
		dueAt: Date,
		failed: Failure,
	): Promise<boolean>;
	/**
	 * Removes the delivery: delivered, or given up. `false` when the lease is
	 * no longer held, or the delivery is gone.
	 */
	deleteDelivery(id: string, lease: string): Promise<boolean>;
}

/**
 * Every method of the port, once: `satisfies` fails to compile the day the
 * port gains one, so neither the wiring check nor the conformance suite can
 * go on missing it.
 */
const METHODS = {
	insertDeliveries: true,
	claimDeliveries: true,
	claimOrphanedDeliveries: true,
	extendLease: true,
	scheduleRetry: true,
	deleteDelivery: true,
} as const satisfies Record<keyof WebhookQueue, true>;

/** A method of the queue port, by name. */
export type WebhookQueueMethod = keyof WebhookQueue & string;

export const QUEUE_METHODS = Object.keys(
	METHODS,
) as readonly WebhookQueueMethod[];
