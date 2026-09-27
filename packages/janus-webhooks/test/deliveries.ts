/**
 * What the deliver, durable and worker specs share: a secret and a URL, new
 * events, the fetch whose answers a spec gives by hand, and the ways a spec
 * waits on and watches a delivery that runs on its own.
 */

import { afterAll, afterEach } from 'bun:test';
import type { UserEvent } from '@nxgt/janus';
import type { Delivery, GivingUp } from '../src/deliver';
import { mintWebhookSecret } from '../src/signature';

export const secret = mintWebhookSecret();
export const url = 'https://hooks.example.test/janus?token=sentinel';

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
