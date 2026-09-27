import { randomUUID } from 'node:crypto';
import type { UserEvent } from '@nxgt/janus';
import type { Failure } from '../request';
import type { QueuedDelivery, WebhookQueue } from './types';

/** One delivery as the map holds it: `due` is the lease's end while claimed. */
interface Held {
	readonly event: UserEvent;
	readonly endpoint: string;
	attempts: number;
	failed: Failure | null;
	lease: string | null;
	due: number;
}

/**
 * The reference queue, in memory: what `webhooks()` uses when it is given
 * none, and what an adapter author compares against.
 *
 * **Shipped and documented, not a test helper**: pass one to two
 * `webhooks()` in a test, and the second takes over what the first left —
 * the way two processes share a Redis. It favours being obviously right over
 * being fast — every claim scans — and keeps the rules for real:
 *
 * - each method does all its work before its first `await`, so it is atomic
 *   on one event loop, and two claims never answer the same delivery;
 * - every event is copied in and out, so a caller cannot reach the queue by
 *   mutating what it passed or got back.
 *
 * It holds nothing beyond the process: a queue that outlives a restart is an
 * adapter's, on a database every process reaches.
 */
export function createMemoryWebhookQueue(): WebhookQueue {
	const held = new Map<string, Held>();

	/** The deliveries of one endpoint due at `at`, earliest first. */
	const dueOf = (endpoint: string, at: number): [string, Held][] =>
		[...held]
			.filter(([, one]) => one.endpoint === endpoint && one.due <= at)
			.sort(([, a], [, b]) => a.due - b.due);

	const claim = (
		endpoints: readonly string[],
		at: number,
		leaseUntil: Date,
		limit: number,
	): QueuedDelivery[] => {
		const claimed: QueuedDelivery[] = [];
		for (const endpoint of new Set(endpoints)) {
			for (const [id, one] of dueOf(endpoint, at)) {
				if (claimed.length >= limit) return claimed;
				one.attempts += 1;
				one.lease = randomUUID();
				one.due = leaseUntil.getTime();
				claimed.push(queuedOf(id, one, one.lease));
			}
		}
		return claimed;
	};

	/** The delivery, when `lease` is the one it holds. */
	const leased = (id: string, lease: string): Held | null => {
		const one = held.get(id);
		return one !== undefined && one.lease !== null && one.lease === lease
			? one
			: null;
	};

	return {
		async insertDeliveries(event, endpoints, dueAt) {
			let inserted = 0;
			for (const endpoint of new Set(endpoints)) {
				const id = `${event.id}:${event.type}:${endpoint}`;
				if (held.has(id)) continue;
				held.set(id, {
					event: copyEvent(event),
					endpoint,
					attempts: 0,
					failed: null,
					lease: null,
					due: dueAt.getTime(),
				});
				inserted += 1;
			}
			return inserted;
		},

		async claimDeliveries(endpoints, now, leaseUntil, limit) {
			return claim(endpoints, now.getTime(), leaseUntil, limit);
		},

		async claimOrphanedDeliveries(known, dueBefore, leaseUntil, limit) {
			const kept = new Set(known);
			const orphaned = [...held.values()]
				.map((one) => one.endpoint)
				.filter((endpoint) => !kept.has(endpoint));
			return claim(orphaned, dueBefore.getTime(), leaseUntil, limit);
		},

		async extendLease(id, lease, until) {
			const one = leased(id, lease);
			if (one === null) return false;
			one.due = until.getTime();
			return true;
		},

		async scheduleRetry(id, lease, dueAt, failed) {
			const one = leased(id, lease);
			if (one === null) return false;
			one.failed = { status: failed.status, error: failed.error };
			one.lease = null;
			one.due = dueAt.getTime();
			return true;
		},

		async deleteDelivery(id, lease) {
			if (leased(id, lease) === null) return false;
			held.delete(id);
			return true;
		},
	};
}

function queuedOf(id: string, one: Held, lease: string): QueuedDelivery {
	return {
		id,
		event: copyEvent(one.event),
		endpoint: one.endpoint,
		attempts: one.attempts,
		failed: one.failed === null ? null : { ...one.failed },
		lease,
	};
}

/** The five fields of an event, and nothing else: what an adapter stores. */
function copyEvent(event: UserEvent): UserEvent {
	return Object.freeze({
		id: event.id,
		type: event.type,
		occurredAt: new Date(event.occurredAt.getTime()),
		userId: event.userId,
		userType: event.userType,
	});
}
