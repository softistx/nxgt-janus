import { equal } from '../../assert';
import { at, claimAll, claimOne, failed, LEASE, only } from '../../fixtures';
import type { WebhookQueueCase } from '../../types';

const group = 'lease';

/**
 * Who may write a claimed delivery: only the lease that holds it, which can
 * also extend it.
 */
export const leaseHoldingCases: readonly WebhookQueueCase[] = [
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
];
