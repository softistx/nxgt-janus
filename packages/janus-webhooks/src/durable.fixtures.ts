import type { UserEvent } from '@nxgt/janus';
import { secret, url } from './deliver.fixtures';
import type { WebhookQueue } from './queue/types';

// What the durable.*.spec.ts files share. Every spec there passes a queue:
// the semantics of one that outlives the process. The deliver.*.spec.ts
// files hold those of 0.1.0, without one, and lend their helpers here.

export {
	givingUps,
	secret,
	until,
	url,
	watchWarnings,
} from './deliver.fixtures';

export const endpoints = [{ id: 'crm', url, secrets: [secret] as [string] }];

let sequence = 0;
/** A new event each time: a queue holds one delivery per event and endpoint. */
export function eventOf(type: UserEvent['type'] = 'user.created'): UserEvent {
	sequence += 1;
	return Object.freeze({
		id: `0199a0db-f800-7000-8000-${String(sequence).padStart(12, '0')}`,
		type,
		occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
		userId: '0199a0db-f800-7000-8000-000000000002',
		userType: 'user',
	});
}

/** A fetch answering each request with the next of `answers`, then the last. */
export function endpoint(...answers: number[]) {
	const sent: RequestInit[] = [];
	const fetch = (async (_: string, init: RequestInit) => {
		sent.push(init);
		const answer = answers[Math.min(sent.length, answers.length) - 1] ?? 200;
		return new Response(null, { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent, fetch };
}

/** A fetch whose answers the spec gives by hand, one per request, in order. */
export function held() {
	const answers: ((status: number) => void)[] = [];
	const fetch = (() =>
		new Promise<Response>((resolve) => {
			answers.push((status) => resolve(new Response(null, { status })));
		})) as unknown as typeof globalThis.fetch;
	return { answers, fetch };
}

export const pause = (ms: number) =>
	new Promise((resolve) => setTimeout(resolve, ms));

/** Every delivery the queue still holds, claimed at the end of time. */
export const waitingIn = (queue: WebhookQueue, ids: readonly string[]) =>
	queue.claimDeliveries(ids, new Date(8.64e15), new Date(8.64e15), 1_000);
