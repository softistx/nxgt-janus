import type { Failure } from '../../../request';
import { equal } from '../../assert';
import { at, claimAll, claimOne, failed, LEASE, only } from '../../fixtures';
import type { WebhookQueueCase } from '../../types';

const group = 'lease';

/**
 * How a lease is settled: a retry, which makes the delivery due again and
 * remembers its failure, or a delete, which removes it for good.
 */
export const leaseSettlingCases: readonly WebhookQueueCase[] = [
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
];
