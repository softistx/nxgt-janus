import { equal } from '../../assert';
import {
	at,
	claimAll,
	claimOne,
	eventOf,
	failed,
	LEASE,
	only,
} from '../../fixtures';
import type { WebhookQueueCase } from '../../types';

const group = 'lease';

/**
 * What an insert of an event already held leaves as it is: a delivery
 * claimed, or one waiting for a retry.
 */
export const leaseReinsertCases: readonly WebhookQueueCase[] = [
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
];
