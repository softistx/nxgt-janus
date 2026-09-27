import type { Failure } from '../../request';
import { equal, ok } from '../assert';
import {
	at,
	claimAll,
	claimOne,
	eventOf,
	failed,
	LEASE,
	only,
} from '../fixtures';
import type { WebhookQueueCase } from '../types';

const group = 'lease';

/** What hides a claimed delivery, what gives it back, and what it keeps. */
export const leaseCases: readonly WebhookQueueCase[] = [
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
		id: 'lease.insertKeepsClaim',
		group,
		name: 'keeps a claimed delivery as it is when its event is inserted again: hidden, its attempts counted',
		async run({ queue }) {
			const event = eventOf();
			await claimOne(queue, event);
			equal(
				await queue.insertDeliveries(event, ['crm'], at(0)),
				0,
				'insertDeliveries of an event whose delivery is claimed: none is new',
			);
			equal(
				await claimAll(queue, ['crm'], at(LEASE - 1)),
				[],
				'insertDeliveries made a claimed delivery due again: an insert must not reset it',
			);
			const again = only(
				await claimAll(queue, ['crm'], at(LEASE)),
				'claimDeliveries once the lease ends',
			);
			equal(
				[again.attempts, again.failed],
				[2, null],
				'insertDeliveries reset the attempts of a delivery it already held',
			);
		},
	},
	{
		id: 'lease.insertKeepsRetry',
		group,
		name: 'keeps a delivery waiting for a retry as it is when its event is inserted again: its due time, attempts and failure',
		async run({ queue }) {
			const event = eventOf();
			const claimed = await claimOne(queue, event);
			await queue.scheduleRetry(claimed.id, claimed.lease, at(5_000), failed);
			equal(
				await queue.insertDeliveries(event, ['crm'], at(0)),
				0,
				'insertDeliveries of an event waiting for a retry: none is new',
			);
			equal(
				await claimAll(queue, ['crm'], at(4_999)),
				[],
				'insertDeliveries made a retry due early: an insert must not reset it',
			);
			const retried = only(
				await claimAll(queue, ['crm'], at(5_000)),
				'claimDeliveries when the retry is due',
			);
			equal(
				[retried.attempts, retried.failed],
				[2, failed],
				'insertDeliveries reset the attempts or the failure of a delivery it already held',
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
		id: 'lease.failureRoundTrip',
		group,
		name: 'remembers a failure with no status as it was written: null, and the error named',
		async run({ queue }) {
			const timedOut: Failure = { status: null, error: 'TimeoutError' };
			const claimed = await claimOne(queue);
			await queue.scheduleRetry(claimed.id, claimed.lease, at(0), timedOut);
			const retried = only(
				await claimAll(queue, ['crm'], at(0)),
				'claimDeliveries when the retry is due',
			);
			equal(
				retried.failed,
				timedOut,
				'claimDeliveries of a retry: a status of null stays null, and the error its name',
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
