import { JanusError, StoreFailure } from '@nxgt/janus';
import type {
	QueuedDelivery,
	WebhookQueue,
	WebhookQueueMethod,
} from '../../queue/types';
import { isOurs, rejects } from '../assert';
import { at, claimOne, eventOf, failed, LEASE } from '../fixtures';
import type { WebhookQueueCase } from '../types';

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
			const seeded = await claimOne(queue);
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
