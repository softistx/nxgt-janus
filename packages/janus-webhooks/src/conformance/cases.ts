/**
 * The cases of the queue suite, as data. Each opens nothing of its own: it
 * runs against the empty queue its harness opened, and passes every time in
 * explicitly — a queue never reads a clock, so neither does a case.
 */

import { JanusError, mintId, StoreFailure, type UserEvent } from '@nxgt/janus';
import type {
	QueuedDelivery,
	WebhookQueue,
	WebhookQueueMethod,
} from '../queue/types';
import type { Failure } from '../request';
import { equal, isOurs, ok, rejects } from './assert';
import type { WebhookQueueCase } from './types';

// ─── Fixtures ─────────────────────────────────────────────────────────────

/** The instant every case counts from. */
const T0 = Date.UTC(2026, 8, 26, 12, 0, 0);
/** `T0` plus `ms`. */
const at = (ms: number): Date => new Date(T0 + ms);
/** How long a case's claims hide a delivery. */
const LEASE = 30_000;

function eventOf(overrides: Partial<UserEvent> = {}): UserEvent {
	return {
		id: mintId(T0),
		type: 'user.created',
		occurredAt: new Date(T0 - 1_234),
		userId: mintId(T0),
		userType: 'user',
		...overrides,
	};
}

/** Claims every delivery of `endpoints` due at `now`, hidden for a lease. */
const claimAll = (
	queue: WebhookQueue,
	endpoints: readonly string[],
	now: Date,
): Promise<readonly QueuedDelivery[]> =>
	queue.claimDeliveries(endpoints, now, new Date(now.getTime() + LEASE), 100);

/** The one delivery a claim answered, or a failure naming what it got. */
function only(
	claimed: readonly QueuedDelivery[],
	what: string,
): QueuedDelivery {
	equal(claimed.length, 1, `${what}: how many it answered`);
	return claimed[0] as QueuedDelivery;
}

const failed: Failure = { status: 503, error: null };

// ─── The cases ────────────────────────────────────────────────────────────

const queueCases: readonly WebhookQueueCase[] = [
	{
		id: 'queue.roundTrip',
		group: 'queue',
		name: 'answers the event byte for byte, its date to the millisecond, one attempt and no failure yet',
		async run({ queue }) {
			const event = eventOf({
				userType: 'Ｒ:1 — ÿ',
				occurredAt: new Date(T0 - 1_234),
			});
			equal(
				await queue.insertDeliveries(event, ['crm'], at(0)),
				1,
				'insertDeliveries: how many were new',
			);

			const claimed = only(
				await claimAll(queue, ['crm'], at(0)),
				'claimDeliveries of a delivery due',
			);
			const { lease, ...rest } = claimed;
			equal(
				rest,
				{
					id: `${event.id}:user.created:crm`,
					event,
					endpoint: 'crm',
					attempts: 1,
					failed: null,
				},
				'claimDeliveries answers the delivery as inserted',
			);
			ok(
				claimed.event.occurredAt instanceof Date,
				'claimDeliveries: event.occurredAt is a Date, not a string or a number',
			);
			ok(
				typeof lease === 'string' && lease.length > 0,
				'claimDeliveries: lease is a string that is not empty',
			);
		},
	},
	{
		id: 'queue.notBeforeDue',
		group: 'queue',
		name: 'claims nothing before it is due — [], never null — and the delivery once it is',
		async run({ queue }) {
			await queue.insertDeliveries(eventOf(), ['crm'], at(1_000));

			equal(
				await claimAll(queue, ['crm'], at(999)),
				[],
				'claimDeliveries one millisecond before it is due answers []',
			);
			only(
				await claimAll(queue, ['crm'], at(1_000)),
				'claimDeliveries at the instant it is due',
			);
		},
	},
	{
		id: 'queue.insertIsIdempotent',
		group: 'queue',
		name: 'inserts one delivery per event and endpoint: the same event again is kept as it is',
		async run({ queue }) {
			const event = eventOf();
			equal(
				await queue.insertDeliveries(event, ['crm', 'search'], at(0)),
				2,
				'insertDeliveries: how many were new',
			);
			equal(
				await queue.insertDeliveries(event, ['crm', 'search'], at(0)),
				0,
				'insertDeliveries of the same event again: none is new',
			);

			const claimed = await claimAll(queue, ['crm', 'search'], at(0));
			equal(
				claimed.map((one) => one.id).sort(),
				[`${event.id}:user.created:crm`, `${event.id}:user.created:search`],
				'claimDeliveries: one delivery per endpoint, whatever the inserts',
			);
		},
	},
	{
		id: 'queue.insertIsAllOrNone',
		group: 'queue',
		name: 'inserts all the endpoints of an event, or none: a rejected insert never leaves some of them',
		needs: 'faults',
		async run({ queue, faults }) {
			const event = eventOf();
			await faults?.fail('insertDeliveries');
			await rejects(
				queue.insertDeliveries(event, ['a', 'b', 'c'], at(0)),
				'insertDeliveries under an outage should reject',
			);

			const left = await claimAll(queue, ['a', 'b', 'c'], at(0));
			ok(
				left.length === 0 || left.length === 3,
				`insertDeliveries rejected, and left ${left.length} of 3 deliveries: an insert is all or none`,
			);
		},
	},
	{
		id: 'queue.endpointsFilter',
		group: 'queue',
		name: 'claims only the deliveries of the endpoints named',
		async run({ queue }) {
			await queue.insertDeliveries(eventOf(), ['crm', 'search'], at(0));

			const claimed = only(
				await claimAll(queue, ['crm'], at(0)),
				'claimDeliveries for one endpoint of two',
			);
			equal(
				claimed.endpoint,
				'crm',
				'claimDeliveries answered a delivery to an endpoint it was not asked for',
			);
		},
	},
	{
		id: 'queue.earliestFirstAndLimit',
		group: 'queue',
		name: 'claims the earliest due first, the endpoints in the order given, and never more than limit',
		async run({ queue }) {
			const [late, early, middle] = [eventOf(), eventOf(), eventOf()];
			await queue.insertDeliveries(late as UserEvent, ['crm'], at(300));
			await queue.insertDeliveries(early as UserEvent, ['crm'], at(100));
			await queue.insertDeliveries(middle as UserEvent, ['crm'], at(200));
			const lease = at(LEASE);

			const first = await queue.claimDeliveries(['crm'], at(1_000), lease, 2);
			equal(
				first.map((one) => one.event.id),
				[early?.id, middle?.id],
				'claimDeliveries with limit 2: the two due earliest, earliest first',
			);
			const next = await queue.claimDeliveries(['crm'], at(1_000), lease, 2);
			equal(
				next.map((one) => one.event.id),
				[late?.id],
				'claimDeliveries again: what the limit left',
			);

			const other = eventOf();
			await queue.insertDeliveries(other, ['search'], at(0));
			await queue.insertDeliveries(other, ['audit'], at(500));
			const walked = await queue.claimDeliveries(
				['audit', 'search'],
				at(1_000),
				lease,
				1,
			);
			equal(
				walked.map((one) => one.endpoint),
				['audit'],
				'claimDeliveries walks the endpoints in the order given: the caller rotates them to share the limit',
			);
		},
	},
];

const orphanCases: readonly WebhookQueueCase[] = [
	{
		id: 'orphans.onlyUnknownAndOverdue',
		group: 'orphans',
		name: 'claims as orphaned only the deliveries of endpoints not known, due at dueBefore or earlier',
		async run({ queue }) {
			const kept = eventOf();
			const overdue = eventOf();
			const recent = eventOf();
			await queue.insertDeliveries(kept, ['crm'], at(0));
			await queue.insertDeliveries(overdue, ['removed'], at(0));
			await queue.insertDeliveries(recent, ['removed'], at(5_000));

			const orphaned = only(
				await queue.claimOrphanedDeliveries(['crm'], at(1_000), at(LEASE), 10),
				'claimOrphanedDeliveries',
			);
			equal(
				[orphaned.event.id, orphaned.endpoint, orphaned.attempts],
				[overdue.id, 'removed', 1],
				'claimOrphanedDeliveries answers the overdue delivery of the unknown endpoint, as a claim',
			);
			equal(
				await queue.claimOrphanedDeliveries(['crm'], at(1_000), at(LEASE), 10),
				[],
				'claimOrphanedDeliveries again: the one claimed is hidden, and nothing else is overdue',
			);
		},
	},
];

/** One delivery, inserted and claimed at `T0`: its lease ends at `LEASE`. */
async function claimOne(queue: WebhookQueue): Promise<QueuedDelivery> {
	await queue.insertDeliveries(eventOf(), ['crm'], at(0));
	return only(await claimAll(queue, ['crm'], at(0)), 'claimDeliveries');
}

const group = 'lease';

/** What hides a claimed delivery, and what gives it back. */
const leaseCases: readonly WebhookQueueCase[] = [
	{
		id: 'lease.hidden',
		group,
		name: 'hides a claimed delivery until its lease ends',
		async run({ queue }) {
			await claimOne(queue);
			equal(
				await claimAll(queue, ['crm'], at(LEASE - 1)),
				[],
				'claimDeliveries before leaseUntil answered a delivery already claimed',
			);
		},
	},
	{
		id: 'lease.expires',
		group,
		name: 'gives a delivery back once its lease ends: one more attempt, and a new lease',
		async run({ queue }) {
			const first = await claimOne(queue);
			const again = only(
				await claimAll(queue, ['crm'], at(LEASE)),
				'claimDeliveries at leaseUntil',
			);
			equal(
				again.id,
				first.id,
				'claimDeliveries at leaseUntil: the same delivery',
			);
			equal(again.attempts, 2, 'claimDeliveries counts each claim an attempt');
			ok(
				again.lease !== first.lease,
				'claimDeliveries answered the lease of the claim before: each claim gets its own',
			);
		},
	},
	{
		id: 'lease.staleLease',
		group,
		name: 'answers false, and changes nothing, for a lease another claim took over',
		async run({ queue }) {
			const stale = await claimOne(queue);
			const held = only(
				await claimAll(queue, ['crm'], at(LEASE)),
				'claimDeliveries at leaseUntil',
			);
			equal(
				await queue.extendLease(stale.id, stale.lease, at(10 * LEASE)),
				false,
				'extendLease with a lease taken over',
			);
			equal(
				await queue.scheduleRetry(stale.id, stale.lease, at(0), failed),
				false,
				'scheduleRetry with a lease taken over',
			);
			equal(
				await queue.deleteDelivery(stale.id, stale.lease),
				false,
				'deleteDelivery with a lease taken over',
			);
			equal(
				await claimAll(queue, ['crm'], at(2 * LEASE - 1)),
				[],
				'a stale lease moved the delivery: it should stay hidden under the lease that holds it',
			);
			equal(
				await queue.deleteDelivery(held.id, held.lease),
				true,
				'deleteDelivery with the lease that holds it',
			);
		},
	},
	{
		id: 'lease.extend',
		group,
		name: 'keeps a delivery hidden until the end of a lease extended',
		async run({ queue }) {
			const claimed = await claimOne(queue);
			equal(
				await queue.extendLease(claimed.id, claimed.lease, at(3 * LEASE)),
				true,
				'extendLease with the lease held',
			);
			equal(
				await claimAll(queue, ['crm'], at(3 * LEASE - 1)),
				[],
				'claimDeliveries before the end of an extended lease',
			);
			only(
				await claimAll(queue, ['crm'], at(3 * LEASE)),
				'claimDeliveries at the end of an extended lease',
			);
		},
	},
	{
		id: 'lease.scheduleRetry',
		group,
		name: 'makes a delivery due again at the retry, remembering the failure, and releases the lease',
		async run({ queue }) {
			const claimed = await claimOne(queue);
			equal(
				await queue.scheduleRetry(claimed.id, claimed.lease, at(5_000), failed),
				true,
				'scheduleRetry with the lease held',
			);
			equal(
				await queue.deleteDelivery(claimed.id, claimed.lease),
				false,
				'deleteDelivery with a lease scheduleRetry released',
			);
			equal(
				await claimAll(queue, ['crm'], at(4_999)),
				[],
				'claimDeliveries before the retry is due',
			);
			const retried = only(
				await claimAll(queue, ['crm'], at(5_000)),
				'claimDeliveries when the retry is due',
			);
			equal(
				[retried.attempts, retried.failed],
				[2, failed],
				'claimDeliveries of a retry: the attempts so far and what the last one got',
			);
		},
	},
	{
		id: 'lease.delete',
		group,
		name: 'removes a delivery for good: never claimed again, and a second delete answers false',
		async run({ queue }) {
			const claimed = await claimOne(queue);
			equal(
				await queue.deleteDelivery(claimed.id, claimed.lease),
				true,
				'deleteDelivery with the lease held',
			);
			equal(
				await claimAll(queue, ['crm'], at(100 * LEASE)),
				[],
				'claimDeliveries after deleteDelivery',
			);
			equal(
				await queue.deleteDelivery(claimed.id, claimed.lease),
				false,
				'deleteDelivery of a delivery gone',
			);
		},
	},
	{
		id: 'lease.concurrentClaims',
		group,
		name: 'never answers one delivery to two claims running at once',
		async run({ queue }) {
			for (let n = 0; n < 10; n += 1) {
				await queue.insertDeliveries(eventOf(), ['crm'], at(0));
			}
			const claims = await Promise.all(
				Array.from({ length: 20 }, () =>
					queue.claimDeliveries(['crm'], at(0), at(LEASE), 1),
				),
			);
			const ids = claims.flat().map((one) => one.id);
			equal(
				new Set(ids).size,
				ids.length,
				'claimDeliveries running at once answered one delivery twice: a claim is atomic',
			);
			equal(
				ids.length,
				10,
				'claimDeliveries running at once: all 10, once each',
			);
		},
	},
];

export const webhookQueueCases: readonly WebhookQueueCase[] = [
	...queueCases,
	...leaseCases,
	...orphanCases,
];

// ─── Outages ──────────────────────────────────────────────────────────────

/**
 * For each method, a queue that cannot answer must **reject** — never `[]`,
 * `false` or `0`. Each case first seeds a delivery and claims it, so a
 * swallowed failure answers something false: a claim that answers `[]` for an
 * outage holds every delivery back without a word.
 */
function outage(
	method: WebhookQueueMethod,
	call: (queue: WebhookQueue, seeded: QueuedDelivery) => Promise<unknown>,
): WebhookQueueCase {
	return {
		id: `outage.${method}`,
		group: 'outage',
		name: `${method} rejects when the queue cannot answer — never [], false or 0`,
		needs: 'faults',
		async run({ queue, faults }) {
			await queue.insertDeliveries(eventOf(), ['crm'], at(0));
			const seeded = only(
				await claimAll(queue, ['crm'], at(0)),
				'claimDeliveries',
			);
			await faults?.fail(method);

			const error = await rejects(
				call(queue, seeded),
				`${method} under an outage should reject`,
			);
			if (
				error instanceof JanusError ||
				(error as { name?: unknown })?.name === 'StoreFailure'
			) {
				isOurs(
					error,
					StoreFailure,
					'StoreFailure',
					`${method} under an outage`,
				);
			}
		},
	};
}

export const webhookQueueOutageCases: readonly WebhookQueueCase[] = [
	outage('insertDeliveries', (queue) =>
		queue.insertDeliveries(eventOf(), ['crm'], at(0)),
	),
	// The seeded delivery's lease ends at LEASE: due again, so [] is a lie.
	outage('claimDeliveries', (queue) =>
		queue.claimDeliveries(['crm'], at(LEASE), at(2 * LEASE), 10),
	),
	outage('claimOrphanedDeliveries', (queue) =>
		queue.claimOrphanedDeliveries([], at(LEASE), at(2 * LEASE), 10),
	),
	outage('extendLease', (queue, { id, lease }) =>
		queue.extendLease(id, lease, at(2 * LEASE)),
	),
	outage('scheduleRetry', (queue, { id, lease }) =>
		queue.scheduleRetry(id, lease, at(LEASE), failed),
	),
	outage('deleteDelivery', (queue, { id, lease }) =>
		queue.deleteDelivery(id, lease),
	),
];

/** Every case, in the order they are described. */
export const allWebhookQueueCases: readonly WebhookQueueCase[] = [
	...webhookQueueCases,
	...webhookQueueOutageCases,
];
