import { type Duration, parseDuration } from '@nxgt/janus';
import type { WebhooksOptions } from './deliver';
import { type Target, targetOf } from './request';

/** The Standard Webhooks retry schedule, after a first attempt at once. */
const SCHEDULE: readonly Duration[] = [
	'5s',
	'5m',
	'30m',
	'2h',
	'5h',
	'10h',
	'10h',
];

/** The longest delay `setTimeout` keeps: 2³¹ − 1 ms, about 24.8 days. */
export const LONGEST = 2 ** 31 - 1;

/** `webhooks()`'s options, checked once when it is called. */
export interface Settings {
	readonly targets: readonly Target[];
	/** The delay before each retry, in ms: `delays[n]` follows attempt `n + 1`. */
	readonly delays: readonly number[];
	readonly timeoutMs: number;
	readonly send: typeof fetch;
}

/** The options checked, or a wiring refusal: a `TypeError`, never a request's. */
export function settingsOf(options: WebhooksOptions, where: string): Settings {
	if (!Array.isArray(options?.endpoints) || options.endpoints.length === 0) {
		throw new TypeError(`${where}: pass at least one endpoint`);
	}
	const retries: unknown = options.retries ?? SCHEDULE;
	if (!Array.isArray(retries)) {
		throw new TypeError(`${where}: retries is a list of durations`);
	}
	return {
		targets: options.endpoints.map((endpoint) => targetOf(endpoint, where)),
		delays: retries.map((delay: Duration) => {
			const ms = parseDuration(delay, `${where}: retries`);
			// Past it, setTimeout fires at once: a retry meant for a month
			// later would be sent immediately.
			if (ms > LONGEST) {
				throw new TypeError(`${where}: retries wait at most 24 days each`);
			}
			return ms;
		}),
		timeoutMs: parseDuration(options.timeout ?? '10s', `${where}: timeout`),
		send: options.fetch ?? fetch,
	};
}
