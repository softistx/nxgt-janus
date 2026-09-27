/**
 * What the cases share. A case opens nothing of its own: it runs against the
 * empty queue its harness opened, and passes every time in explicitly — a
 * queue never reads a clock, so neither does a case.
 */

import { mintId, type UserEvent } from '@nxgt/janus';
import type { QueuedDelivery, WebhookQueue } from '../queue/types';
import type { Failure } from '../request';
import { equal } from './assert';

/** The instant every case counts from. */
export const T0 = Date.UTC(2026, 8, 26, 12, 0, 0);
/** `T0` plus `ms`. */
export const at = (ms: number): Date => new Date(T0 + ms);
/** How long a case's claims hide a delivery. */
export const LEASE = 30_000;

export function eventOf(overrides: Partial<UserEvent> = {}): UserEvent {
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
export const claimAll = (
	queue: WebhookQueue,
	endpoints: readonly string[],
	now: Date,
): Promise<readonly QueuedDelivery[]> =>
	queue.claimDeliveries(endpoints, now, new Date(now.getTime() + LEASE), 100);

/** The one delivery a claim answered, or a failure naming what it got. */
export function only(
	claimed: readonly QueuedDelivery[],
	what: string,
): QueuedDelivery {
	equal(claimed.length, 1, `${what}: how many it answered`);
	const [one] = claimed;
	if (one === undefined) throw new Error(`${what}: answered no delivery`);
	return one;
}

/** One delivery, inserted and claimed at `T0`: its lease ends at `LEASE`. */
export async function claimOne(
	queue: WebhookQueue,
	event: UserEvent = eventOf(),
): Promise<QueuedDelivery> {
	await queue.insertDeliveries(event, ['crm'], at(0));
	return only(await claimAll(queue, ['crm'], at(0)), 'claimDeliveries');
}

/** What an attempt answered with a status got. */
export const failed: Failure = { status: 503, error: null };
