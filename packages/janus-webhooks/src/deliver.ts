import { type Duration, parseDuration, type UserEvent } from '@nxgt/janus';
import {
	type Failure,
	post,
	type Target,
	targetOf,
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

/** The Standard Webhooks retry schedule, after a first attempt at once. */
/** The longest delay `setTimeout` keeps: 2³¹ − 1 ms, about 24.8 days. */
const LONGEST = 2 ** 31 - 1;

/** The warning for a delivery given up with no `onGivingUp`: the origin, never the URL. */
function gaveUp(
	delivery: Delivery,
	reason: GivingUp,
	origin: string | undefined,
): string {
	const { attempts, event } = delivery;
	const plural = attempts === 1 ? '' : 's';
	const got = reason.status ?? reason.error ?? 'no answer';
	return `webhooks: gave up ${event.type} ${event.id} to ${origin} after ${attempts} attempt${plural} (${reason.why}, ${got})`;
}

const SCHEDULE: readonly Duration[] = [
	'5s',
	'5m',
	'30m',
	'2h',
	'5h',
	'10h',
	'10h',
];

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
	if (!Array.isArray(options?.endpoints) || options.endpoints.length === 0) {
		throw new TypeError(`${where}: pass at least one endpoint`);
	}
	const targets = options.endpoints.map((endpoint) =>
		targetOf(endpoint, where),
	);
	const retries: unknown = options.retries ?? SCHEDULE;
	if (!Array.isArray(retries)) {
		throw new TypeError(`${where}: retries is a list of durations`);
	}
	const delays = retries.map((delay: Duration) => {
		const ms = parseDuration(delay, `${where}: retries`);
		// Past it, setTimeout fires at once: a retry meant for a month later
		// would be sent immediately.
		if (ms > LONGEST) {
			throw new TypeError(`${where}: retries wait at most 24 days each`);
		}
		return ms;
	});
	const timeoutMs = parseDuration(
		options.timeout ?? '10s',
		`${where}: timeout`,
	);
	const send = options.fetch ?? fetch;

	const waiting = new Map<
		ReturnType<typeof setTimeout>,
		{ readonly delivery: Delivery; readonly failed: Failure }
	>();
	const inFlight = new Set<Promise<void>>();
	let closed = false;

	const giveUp = async (delivery: Delivery, reason: GivingUp) => {
		if (options.onGivingUp === undefined) {
			const target = targets.find((one) => one.url === delivery.url);
			process.emitWarning(gaveUp(delivery, reason, target?.origin), {
				code: 'JANUS_WEBHOOK_GAVE_UP',
			});
			return;
		}
		try {
			await options.onGivingUp(delivery, reason);
		} catch (failure) {
			process.emitWarning(
				`webhooks: onGivingUp failed on ${delivery.event.type} ${delivery.event.id}: ${failure instanceof Error ? failure.name : typeof failure}`,
				{ code: 'JANUS_WEBHOOK_REPORT_FAILED' },
			);
		}
	};

	const attempt = (target: Target, delivery: Delivery): void => {
		const run = (async () => {
			const failed = await post(target, delivery.event, send, timeoutMs);
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
			schedule(target, sent, failed, delay);
		})();
		inFlight.add(run);
		void run.finally(() => inFlight.delete(run));
	};

	const schedule = (
		target: Target,
		delivery: Delivery,
		failed: Failure,
		ms: number,
	): void => {
		const timer = setTimeout(() => {
			waiting.delete(timer);
			attempt(target, delivery);
		}, ms);
		// Retries wait in memory, and never hold the process open: close()
		// is what hands them over on shutdown.
		timer.unref?.();
		waiting.set(timer, { delivery, failed });
	};

	const listener = (event: UserEvent): void => {
		for (const target of targets) {
			if (target.types !== null && !target.types.has(event.type)) continue;
			const delivery: Delivery = { event, url: target.url, attempts: 0 };
			if (closed) {
				void giveUp(delivery, { why: 'closed', status: null, error: null });
				continue;
			}
			// At once, not on a timer: the request under way keeps the process
			// alive, where an unref'd timer would let a script exit first.
			attempt(target, delivery);
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
