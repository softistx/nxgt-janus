import type { UserEvent } from '@nxgt/janus';

// What the deliver.*.spec.ts files share — webhooks() without a queue, the
// semantics of 0.1.0: one event, and the fetch a delivery is sent through.
// What the deliver, durable and worker specs share is test/deliveries.ts'.

export {
	givingUps,
	secret,
	until,
	url,
	watchWarnings,
} from '../test/deliveries';

export const event: UserEvent = Object.freeze({
	id: '0199a0db-f800-7000-8000-000000000001',
	type: 'user.created',
	occurredAt: new Date(Date.UTC(2026, 8, 26, 11, 59)),
	userId: '0199a0db-f800-7000-8000-000000000002',
	userType: 'user',
});

export interface Sent {
	readonly url: string;
	readonly init: RequestInit;
}

/**
 * A fetch that answers each request with the next status of `answers` — a
 * number, or `'throw'` for a network failure — and the last one after them.
 */
export function endpoint(...answers: (number | 'throw')[]) {
	const sent: Sent[] = [];
	const fetch = (async (input: string, init: RequestInit) => {
		sent.push({ url: input, init });
		const answer = answers[Math.min(sent.length, answers.length) - 1] ?? 200;
		if (answer === 'throw') throw new TypeError('fetch failed');
		return new Response('ignored', { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent, fetch };
}
