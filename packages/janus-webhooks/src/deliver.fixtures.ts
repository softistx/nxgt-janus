import { afterAll, afterEach } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import type { Delivery, GivingUp } from './deliver';
import { mintWebhookSecret } from './signature';

// What the deliver.*.spec.ts files share — webhooks() without a queue, the
// semantics of 0.1.0: one endpoint, one event, and the fetch and the report
// a delivery is watched through.

export const secret = mintWebhookSecret();
export const url = 'https://hooks.example.test/janus?token=sentinel';

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

/** Resolves once `check` holds, polling: deliveries run on their own. */
export async function until(check: () => boolean, tries = 200): Promise<void> {
	for (let n = 0; !check(); n++) {
		if (n > tries) throw new Error('never happened');
		await new Promise((resolve) => setTimeout(resolve, 5));
	}
}

export function givingUps() {
	const given: [Delivery, GivingUp][] = [];
	return {
		given,
		onGivingUp: (delivery: Delivery, reason: GivingUp) => {
			given.push([delivery, reason]);
		},
	};
}

/**
 * Collects the process's warnings for the spec file or `describe` that calls
 * it, emptied after each case and no longer collected after the last.
 */
export function watchWarnings(): (Error & { code?: string })[] {
	const warnings: (Error & { code?: string })[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});
	return warnings;
}
