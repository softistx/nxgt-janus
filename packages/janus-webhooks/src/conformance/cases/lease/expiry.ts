import { equal, ok } from '../../assert';
import { at, claimAll, claimOne, LEASE, only } from '../../fixtures';
import type { WebhookQueueCase } from '../../types';

const group = 'lease';

/** What hides a claimed delivery, and what gives it back once its lease ends. */
export const leaseExpiryCases: readonly WebhookQueueCase[] = [
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
];
