import { equal } from '../assert';
import { at, eventOf, LEASE, only } from '../fixtures';
import type { WebhookQueueCase } from '../types';

const group = 'orphans';

/** The deliveries no configuration sends any more. */
export const orphanCases: readonly WebhookQueueCase[] = [
	{
		id: 'orphans.onlyUnknownAndOverdue',
		group,
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
	{
		id: 'orphans.limit',
		group,
		name: 'claims no more orphans than limit',
		async run({ queue }) {
			for (let n = 0; n < 3; n += 1) {
				await queue.insertDeliveries(eventOf(), ['removed'], at(0));
			}

			const first = await queue.claimOrphanedDeliveries(
				[],
				at(0),
				at(LEASE),
				2,
			);
			equal(first.length, 2, 'claimOrphanedDeliveries with limit 2');
			const next = await queue.claimOrphanedDeliveries([], at(0), at(LEASE), 2);
			equal(
				next.length,
				1,
				'claimOrphanedDeliveries again: what the limit left',
			);
		},
	},
];
