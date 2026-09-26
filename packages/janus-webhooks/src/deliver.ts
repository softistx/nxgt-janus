import type { Duration, UserEvent } from '@nxgt/janus';
import { settingsOf } from './options';
import { reporterOf } from './report';
import {
	bodyFor,
	type Failure,
	post,
	type Target,
	type WebhookEndpoint,
} from './request';

export type { Failure, WebhookEndpoint };

/** One event on its way to one endpoint. */
export interface Delivery {
	readonly event: UserEvent;
	/** The endpoint's URL. */
	readonly url: string;
	/** How many requests were sent: `0` for one closed before its first. */
	readonly attempts: number;
}

/** Why a delivery was given up, and what its last attempt got. */
export interface GivingUp extends Failure {
	/**
	 * `retriesRanOut`: every attempt failed. `closed`: `close()` came first —
	 * the delivery waited for a retry, failed after the call, or its event
	 * arrived after it.
	 */
	readonly why: 'retriesRanOut' | 'closed';
}

export interface WebhooksOptions {
	readonly endpoints: readonly WebhookEndpoint[];
	/**
	 * How long to wait before each retry. The Standard Webhooks schedule when
	 * absent — `5s`, `5m`, `30m`, `2h`, `5h`, `10h`, `10h`: eight attempts
	 * over a day and more. `[]` sends once.
	 */
	readonly retries?: readonly Duration[];
	/** How long one request may take. `'10s'` when absent. */
	readonly timeout?: Duration;
	/**
	 * Called once for each delivery given up. Absent, a
	 * `JANUS_WEBHOOK_GAVE_UP` warning says so instead: never silence.
	 */
	readonly onGivingUp?: (
		delivery: Delivery,
		reason: GivingUp,
	) => void | Promise<void>;
	/** The `fetch` requests go through. The global one when absent. */
	readonly fetch?: typeof fetch;
}

/** What `webhooks()` answers: the listener `janus({ events })` takes, and `close`. */
export interface Webhooks {
	(event: UserEvent): void;
	/**
	 * Waits for the requests in flight, cancels the retries still waiting and
	 * gives each of them up as `closed`. Call it on shutdown: retries wait in
	 * memory, and a process that exits without it loses them.
	 */
	close(): Promise<void>;
}

/**
 * Signs user events and posts them to your endpoints, retrying on failure:
 * the listener to hand `janus({ events })`.
 *
 * ```ts
 * const listener = webhooks({ endpoints: [{ url, secrets: [secret] }] });
 * const auth = janus({ ..., events: listener });
 * process.on('SIGTERM', () => listener.close());
 * ```
 *
 * A request succeeds on a `2xx`, and nothing else: a redirect is not
 * followed, and counts as a failure. The listener returns at once — it
 * starts the first request and does not wait for it — so no flow waits on
 * an endpoint.
 */
export function webhooks(options: WebhooksOptions): Webhooks {
	const where = 'webhooks';
	const { targets, delays, timeoutMs, send } = settingsOf(options, where);

	const waiting = new Map<
		ReturnType<typeof setTimeout>,
		{ readonly delivery: Delivery; readonly failed: Failure }
	>();
	const inFlight = new Set<Promise<void>>();
	let closed = false;

	const giveUp = reporterOf(options.onGivingUp, targets);

	const attempt = (target: Target, delivery: Delivery, body: string): void => {
		const run = (async () => {
			const failed = await post(target, delivery.event, body, send, timeoutMs);
			const sent: Delivery = { ...delivery, attempts: delivery.attempts + 1 };
			if (failed === null) return;
			const delay = delays[delivery.attempts];
			if (delay === undefined || closed) {
				await giveUp(sent, {
					why: delay === undefined ? 'retriesRanOut' : 'closed',
					...failed,
				});
				return;
			}
			schedule(target, sent, body, failed, delay);
		})();
		inFlight.add(run);
		void run.finally(() => inFlight.delete(run));
	};

	const schedule = (
		target: Target,
		delivery: Delivery,
		body: string,
		failed: Failure,
		ms: number,
	): void => {
		const timer = setTimeout(() => {
			waiting.delete(timer);
			attempt(target, delivery, body);
		}, ms);
		// Retries wait in memory, and never hold the process open: close()
		// is what hands them over on shutdown.
		timer.unref?.();
		waiting.set(timer, { delivery, failed });
	};

	const listener = (event: UserEvent): void => {
		// Once, before any request: an event that is not one is a mistake of
		// the caller's, refused at once rather than retried for a day.
		const body = bodyFor(event, where);
		for (const target of targets) {
			if (target.types !== null && !target.types.has(event.type)) continue;
			const delivery: Delivery = { event, url: target.url, attempts: 0 };
			if (closed) {
				void giveUp(delivery, { why: 'closed', status: null, error: null });
				continue;
			}
			// At once, not on a timer: the request under way keeps the process
			// alive, where an unref'd timer would let a script exit first.
			attempt(target, delivery, body);
		}
	};

	return Object.assign(listener, {
		async close() {
			closed = true;
			const given: Promise<void>[] = [];
			for (const [timer, { delivery, failed }] of waiting) {
				clearTimeout(timer);
				given.push(giveUp(delivery, { why: 'closed', ...failed }));
			}
			waiting.clear();
			await Promise.all([...given, ...inFlight]);
		},
	});
}
