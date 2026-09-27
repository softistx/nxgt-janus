import { until as untilWithin, watchWarnings } from '../../test/deliveries';
import { mintWebhookSecret } from '../signature';

// What the worker.*.spec.ts files share. They hold the worker's edges: what
// a slow report, a queue that fails half-way, or a queue that answers
// nonsense does to a delivery. What the deliver and durable specs share
// with them is test/deliveries.ts'.

export { eventOf, givingUps, held, pause } from '../../test/deliveries';

const secret = mintWebhookSecret();
const url = 'https://hooks.example.test/janus';
export const crm = { id: 'crm', url, secrets: [secret] as [string] };
export const endpoints = [crm];
/** The shortest lease the wiring takes over a 10 ms timeout. */
export const short = { timeout: '10ms', lease: '1010ms' } as const;

/**
 * A fetch answering each request with the next of `answers`, then the last.
 * Unlike the deliver and durable specs' own, it keeps only a count: `sent()`.
 */
export function endpoint(...answers: number[]) {
	let sent = 0;
	const fetch = (async () => {
		sent += 1;
		const answer = answers[Math.min(sent, answers.length) - 1] ?? 200;
		return new Response(null, { status: answer });
	}) as unknown as typeof globalThis.fetch;
	return { sent: () => sent, fetch };
}

/** `until`, with twice the patience: a lease here runs a second. */
export const until = (check: () => boolean, tries = 400) =>
	untilWithin(check, tries);

/** The JANUS_WEBHOOK_QUEUE_FAILED warnings of the spec file that calls it. */
export function watchQueueFailures() {
	const warnings = watchWarnings();
	return () =>
		warnings.filter((one) => one.code === 'JANUS_WEBHOOK_QUEUE_FAILED');
}
