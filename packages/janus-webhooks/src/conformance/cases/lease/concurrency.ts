import { equal } from '../../assert';
import { at, eventOf, LEASE } from '../../fixtures';
import type { WebhookQueueCase } from '../../types';

const group = 'lease';

/** What claims running at once answer: never one delivery twice. */
export const leaseConcurrencyCases: readonly WebhookQueueCase[] = [
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
