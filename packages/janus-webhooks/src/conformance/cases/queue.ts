import type { UserEventType } from '@nxgt/janus';
import { equal, ok, rejects } from '../assert';
import { at, claimAll, eventOf, LEASE, only, T0 } from '../fixtures';
import type { WebhookQueueCase } from '../types';

const group = 'queue';

/** Every user event type: each must come back as it was written. */
const TYPES: readonly UserEventType[] = [
	'user.created',
	'user.emailVerified',
	'user.passwordReset',
	'user.secondFactorEnabled',
	'user.secondFactorDisabled',
	'user.recoveryCodesRegenerated',
	'user.recoveryCodeUsed',
	'user.deleted',
];

/** What an insert keeps, and what a claim answers. */
export const queueCases: readonly WebhookQueueCase[] = [
	{
		id: 'queue.roundTrip',
		group,
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
		id: 'queue.everyType',
		group,
		name: 'answers each of the six event types as it was written',
		async run({ queue }) {
			const events = TYPES.map((type) => eventOf({ type }));
			for (const event of events) {
				await queue.insertDeliveries(event, ['crm'], at(0));
			}

			const claimed = await claimAll(queue, ['crm'], at(0));
			equal(
				claimed.map((one) => one.event.type).sort(),
				[...TYPES].sort(),
				'claimDeliveries answers every event type as inserted',
			);
			for (const one of claimed) {
				equal(
					one.id,
					`${one.event.id}:${one.event.type}:crm`,
					'claimDeliveries: the id names the type of the event it holds',
				);
			}
		},
	},
	{
		id: 'queue.notBeforeDue',
		group,
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
		group,
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
		id: 'queue.insertNoEndpoint',
		group,
		name: 'inserts nothing for no endpoint, and answers 0',
		async run({ queue }) {
			equal(
				await queue.insertDeliveries(eventOf(), [], at(0)),
				0,
				'insertDeliveries for no endpoint: how many were new',
			);
		},
	},
	{
		id: 'queue.rejectedInsertLeavesNothing',
		group,
		name: 'leaves nothing of an insert it rejected',
		needs: 'faults',
		async run({ queue, faults }) {
			// The fault fails the call as the database would, before it lands:
			// a rejection must not follow a write of some of the endpoints.
			await faults?.fail('insertDeliveries');
			await rejects(
				queue.insertDeliveries(eventOf(), ['a', 'b', 'c'], at(0)),
				'insertDeliveries under an outage should reject',
			);

			const left = await claimAll(queue, ['a', 'b', 'c'], at(0));
			equal(
				left.length,
				0,
				'insertDeliveries rejected, and still left deliveries behind',
			);
		},
	},
	{
		id: 'queue.endpointsFilter',
		group,
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
		group,
		name: 'claims the earliest due first, the endpoints in the order given, and never more than limit',
		async run({ queue }) {
			const late = eventOf();
			const early = eventOf();
			const middle = eventOf();
			await queue.insertDeliveries(late, ['crm'], at(300));
			await queue.insertDeliveries(early, ['crm'], at(100));
			await queue.insertDeliveries(middle, ['crm'], at(200));
			const lease = at(LEASE);

			const first = await queue.claimDeliveries(['crm'], at(1_000), lease, 2);
			equal(
				first.map((one) => one.event.id),
				[early.id, middle.id],
				'claimDeliveries with limit 2: the two due earliest, earliest first',
			);
			const next = await queue.claimDeliveries(['crm'], at(1_000), lease, 2);
			equal(
				next.map((one) => one.event.id),
				[late.id],
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
