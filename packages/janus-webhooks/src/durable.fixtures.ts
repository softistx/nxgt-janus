import { secret, url } from '../test/deliveries';
import type { WebhookQueue } from './queue/types';

// What the durable.*.spec.ts files share. Every spec there passes a queue:
// the semantics of one that outlives the process. The deliver.*.spec.ts
// files hold those of 0.1.0, without one.

export {
	eventOf,
	givingUps,
	held,
	pause,
	secret,
	until,
	url,
	watchWarnings,
} from '../test/deliveries';

export const endpoints = [{ id: 'crm', url, secrets: [secret] as [string] }];

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

/** Every delivery the queue still holds, claimed at the end of time. */
export const waitingIn = (queue: WebhookQueue, ids: readonly string[]) =>
	queue.claimDeliveries(ids, new Date(8.64e15), new Date(8.64e15), 1_000);
