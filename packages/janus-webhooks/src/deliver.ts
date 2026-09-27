import type { Duration, UserEvent } from '@nxgt/janus';
import { settingsOf } from './options';
import type { WebhookQueue } from './queue/types';
import { reporterOf } from './report';
import { bodyFor, type Failure, type WebhookEndpoint } from './request';
import { startWorker } from './worker';

export type { Failure, WebhookEndpoint };

/** One event on its way to one endpoint. */
export interface Delivery {
	readonly event: UserEvent;
	/**
	 * The endpoint's URL — or `null` for a delivery given up as
	 * `endpointRemoved`: a queue holds the endpoint's id and never its URL,
	 * and no endpoint configured has that id any more.
	 */
	readonly url: string | null;
	/**
	 * The endpoint's id: its `id`, or the one `webhooks()` gave it — a hash
	 * of its URL with a `queue`, its position in `endpoints` without one.
	 */
	readonly endpoint: string;
	/** How many requests were sent: `0` for one given up before its first. */
	readonly attempts: number;
}

/** Why a delivery was given up, and what its last attempt got. */
export interface GivingUp extends Failure {
	/**
	 * `retriesRanOut`: every attempt failed. `closed`: `close()` came first —
	 * the delivery waited for a retry, failed after the call, or its event
	 * arrived after it; never with a `queue`, which keeps them for the next
	 * process. `endpointRemoved`: it waited in the queue, for longer than
	 * `orphanGrace`, for an endpoint no process is configured with any more.
	 */
	readonly why: 'retriesRanOut' | 'closed' | 'endpointRemoved';
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
	/**
	 * Where deliveries wait between the event and their last attempt, shared
	 * by every process that passes the same one: a retry outlives the process
	 * that failed it. Absent, they wait in this process's memory, and a crash
	 * loses them.
	 */
	readonly queue?: WebhookQueue;
	/** How many requests this process sends at once, all endpoints together. `64` when absent. */
	readonly concurrency?: number;
	/**
	 * How often the `queue` is asked for what other processes left due, give
	 * or take a fifth. `'1s'` when absent. With a `queue` only.
	 */
	readonly poll?: Duration;
	/**
	 * How long a claimed delivery is hidden from every other process: longer
	 * than `timeout`, so no request is sent twice at once. `timeout` plus
	 * `'30s'` when absent.
	 */
	readonly lease?: Duration;
	/**
	 * How long a delivery to an endpoint no process is configured with may
	 * wait before it is given up as `endpointRemoved` — long enough for a
	 * rolling deploy that adds or removes one. `'24h'` when absent. With a
	 * `queue` only.
	 */
	readonly orphanGrace?: Duration;
}

/** What `webhooks()` answers: the listener `janus({ events })` takes, and `close`. */
export interface Webhooks {
	/**
	 * With a `queue`, resolves once the event's deliveries are in it, and
	 * rejects when the queue does — `janus` then warns with the event's id.
	 * Without one, answers nothing: the deliveries wait in memory, which
	 * cannot fail.
	 */
	(event: UserEvent): Promise<void> | undefined;
	/**
	 * Stops sending, and waits for the requests in flight. Without a
	 * `queue`, gives up every delivery still waiting as `closed` — call it on
	 * shutdown, or a process that exits loses them without a word. With one,
	 * gives up nothing: what waits is sent by the next process.
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
 * followed, and counts as a failure. Every delivery goes through a queue —
 * the `queue` passed, or one in memory — and the listener waits for the
 * insert only: the first request starts at once, and no flow waits on an
 * endpoint.
 */
export function webhooks(options: WebhooksOptions): Webhooks {
	const where = 'webhooks';
	const settings = settingsOf(options, where);
	const { targets } = settings;
	const durable = settings.queue !== null;
	const giveUp = reporterOf(options.onGivingUp);
	const worker = startWorker(settings, giveUp);
	let closed = false;

	const listener = (event: UserEvent): Promise<void> | undefined => {
		// Once, before any insert: an event that is not one is a mistake of
		// the caller's, refused at once rather than retried for a day.
		bodyFor(event, where);
		const to = targets.filter(
			(target) => target.types === null || target.types.has(event.type),
		);
		// No endpoint takes this type: nothing to insert, nothing to wait for.
		if (to.length === 0) return undefined;
		if (closed && !durable) {
			for (const { url, endpoint, origin } of to) {
				const delivery: Delivery = { event, url, endpoint, attempts: 0 };
				const reason = { why: 'closed', status: null, error: null } as const;
				void giveUp(delivery, reason, origin);
			}
			return undefined;
		}
		const inserted = worker.accept(
			event,
			to.map((target) => target.key),
		);
		return durable ? inserted : undefined;
	};

	return Object.assign(listener, {
		async close() {
			closed = true;
			await worker.close();
		},
	});
}
