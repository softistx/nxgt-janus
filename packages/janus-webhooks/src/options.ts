import { createHash } from 'node:crypto';
import { type Duration, parseDuration } from '@nxgt/janus';
import type { WebhooksOptions } from './deliver';
import { QUEUE_METHODS, type WebhookQueue } from './queue/types';
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
	/** The queue passed, or `null`: then deliveries wait in this process's memory. */
	readonly queue: WebhookQueue | null;
	/** How many requests this process sends at once, all endpoints together. */
	readonly concurrency: number;
	/** How long a claim hides a delivery from every other claim. */
	readonly leaseMs: number;
	/** How often a queue is asked for what other processes left due. */
	readonly pollMs: number;
	/** How long a delivery to an endpoint no longer configured waits before it is given up. */
	readonly orphanGraceMs: number;
}

/** The options checked, or a wiring refusal: a `TypeError`, never a request's. */
export function settingsOf(options: WebhooksOptions, where: string): Settings {
	if (!Array.isArray(options?.endpoints) || options.endpoints.length === 0) {
		throw new TypeError(`${where}: pass at least one endpoint`);
	}
	const queue = queueOf(options.queue, where);
	const timeoutMs = parseDuration(
		options.timeout ?? '10s',
		`${where}: timeout`,
	);
	return {
		targets: targetsOf(options, queue !== null, where),
		delays: delaysOf(options.retries, where),
		timeoutMs,
		send: options.fetch ?? fetch,
		queue,
		...queueingOf(options, queue !== null, timeoutMs, where),
	};
}

/**
 * The endpoints, each with its id — and no two with one id, which would
 * make two endpoints one delivery.
 */
function targetsOf(
	options: WebhooksOptions,
	durable: boolean,
	where: string,
): Target[] {
	// With a queue, an id outlives the process, so it cannot be a position:
	// removing the first endpoint would hand its deliveries to the second.
	// It is never the URL either, whose query may hold a token.
	const targets = options.endpoints.map((endpoint, index) =>
		targetOf(endpoint, where, (href) =>
			durable
				? createHash('sha256').update(href).digest('hex').slice(0, 32)
				: String(index),
		),
	);
	if (new Set(targets.map((one) => one.endpoint)).size !== targets.length) {
		throw new TypeError(
			`${where}: two endpoints have one id — give each an id of its own; with a queue, two with the same url need one`,
		);
	}
	return targets;
}

/** The delay before each retry, in ms. */
function delaysOf(
	retries: WebhooksOptions['retries'],
	where: string,
): number[] {
	const list: unknown = retries ?? SCHEDULE;
	if (!Array.isArray(list)) {
		throw new TypeError(`${where}: retries is a list of durations`);
	}
	return list.map((delay: Duration) => {
		const ms = parseDuration(delay, `${where}: retries`);
		// Past it, setTimeout fires at once: a retry meant for a month
		// later would be sent immediately.
		if (ms > LONGEST) {
			throw new TypeError(`${where}: retries wait at most 24 days each`);
		}
		return ms;
	});
}

/** The queue passed, checked method by method for a JavaScript caller. */
function queueOf(queue: unknown, where: string): WebhookQueue | null {
	if (queue === undefined) return null;
	const missing = QUEUE_METHODS.find(
		(method) =>
			typeof (queue as Record<string, unknown> | null)?.[method] !== 'function',
	);
	if (missing !== undefined) {
		throw new TypeError(
			`${where}: queue is not a WebhookQueue — it has no ${missing}`,
		);
	}
	return queue as WebhookQueue;
}

/** How deliveries are claimed: `concurrency`, `lease`, `poll`, `orphanGrace`. */
function queueingOf(
	options: WebhooksOptions,
	durable: boolean,
	timeoutMs: number,
	where: string,
): Pick<Settings, 'concurrency' | 'leaseMs' | 'pollMs' | 'orphanGraceMs'> {
	const concurrency: unknown = options.concurrency ?? 64;
	if (!Number.isSafeInteger(concurrency) || (concurrency as number) < 1) {
		throw new TypeError(
			`${where}: concurrency is a whole number of requests, 1 or more`,
		);
	}
	if (
		!durable &&
		(options.poll !== undefined || options.orphanGrace !== undefined)
	) {
		throw new TypeError(
			`${where}: poll and orphanGrace take effect with a queue only — pass one, or leave them out`,
		);
	}
	// A request is aborted at timeout, so a lease past it covers the whole
	// request: no other process claims a delivery still being sent.
	const leaseMs = timerOf(options.lease ?? timeoutMs + 30_000, 'lease', where);
	if (leaseMs <= timeoutMs) {
		throw new TypeError(
			`${where}: lease must be longer than timeout — a request outliving its lease is sent twice`,
		);
	}
	return {
		concurrency: concurrency as number,
		leaseMs,
		pollMs: timerOf(options.poll ?? '1s', 'poll', where),
		orphanGraceMs: parseDuration(
			options.orphanGrace ?? '24h',
			`${where}: orphanGrace`,
		),
	};
}

/** A duration a timer waits for: at most what `setTimeout` keeps. */
function timerOf(value: Duration, name: string, where: string): number {
	const ms = parseDuration(value, `${where}: ${name}`);
	if (ms > LONGEST) {
		throw new TypeError(`${where}: ${name} waits at most 24 days`);
	}
	return ms;
}
