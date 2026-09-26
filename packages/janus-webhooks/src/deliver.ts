import {
	type Duration,
	parseDuration,
	type UserEvent,
	type UserEventType,
} from '@nxgt/janus';
import { bodyOf } from './payload';
import { keyOf, sign } from './signature';

/** Where events are sent, and what they are signed with. */
export interface WebhookEndpoint {
	/** `https://`, or `http://` to `localhost` for development. */
	readonly url: string;
	/**
	 * Every request is signed with each: to rotate, add the new secret, let
	 * the receiver accept it, then remove the old one.
	 */
	readonly secrets: readonly [string, ...string[]];
	/** The event types this endpoint receives. Every type when absent. */
	readonly types?: readonly UserEventType[];
}

/** One event on its way to one endpoint. */
export interface Delivery {
	readonly event: UserEvent;
	/** The endpoint's URL. */
	readonly url: string;
	/** How many requests were sent: `0` for one closed before its first. */
	readonly attempts: number;
}

/** Why a delivery was given up. */
export interface GivingUp {
	/**
	 * `retriesRanOut`: every attempt failed. `closed`: `close()` came first —
	 * the delivery waited for a retry, failed after the call, or its event
	 * arrived after it.
	 */
	readonly why: 'retriesRanOut' | 'closed';
	/**
	 * The last attempt's response status, or `null` when it had none — or
	 * when no attempt was made.
	 */
	readonly status: number | null;
	/** The last failure's name — `TimeoutError`, `TypeError` — or `null`. */
	readonly error: string | null;
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
const SCHEDULE: readonly Duration[] = [
	'5s',
	'5m',
	'30m',
	'2h',
	'5h',
	'10h',
	'10h',
];

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

const TYPES: ReadonlySet<string> = new Set<UserEventType>([
	'user.created',
	'user.emailVerified',
	'user.passwordReset',
	'user.deleted',
]);

interface Target {
	readonly url: string;
	readonly origin: string;
	readonly keys: readonly Buffer[];
	readonly types: ReadonlySet<UserEventType> | null;
}

function targetOf(endpoint: WebhookEndpoint, where: string): Target {
	let url: URL;
	try {
		url = new URL(endpoint?.url);
	} catch {
		throw new TypeError(`${where}: an endpoint's url is not a URL`);
	}
	if (
		url.protocol !== 'https:' &&
		!(url.protocol === 'http:' && LOCAL.has(url.hostname))
	) {
		throw new TypeError(
			`${where}: an endpoint's url must be https:// — http:// only to localhost`,
		);
	}
	const secrets = endpoint.secrets;
	if (!Array.isArray(secrets) || secrets.length === 0) {
		throw new TypeError(`${where}: an endpoint needs at least one secret`);
	}
	const types = endpoint.types;
	if (
		types !== undefined &&
		(!Array.isArray(types) || !types.every((one) => TYPES.has(one)))
	) {
		throw new TypeError(
			`${where}: an endpoint's types are user event types — ${[...TYPES].join(', ')}`,
		);
	}
	return {
		url: url.href,
		origin: url.origin,
		keys: secrets.map((secret) => keyOf(secret, where)),
		types: types === undefined ? null : new Set(types),
	};
}

/**
 * Signs user events and posts them to your endpoints, retrying on failure:
 * the listener to hand `janus({ events })`.
 *
 * ```ts
 * const hooks = webhooks({ endpoints: [{ url, secrets: [secret] }] });
 * const auth = janus({ ..., events: hooks });
 * process.on('SIGTERM', () => hooks.close());
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
	const delays = (options.retries ?? SCHEDULE).map((delay) =>
		parseDuration(delay, `${where}: retries`),
	);
	const timeoutMs = parseDuration(
		options.timeout ?? '10s',
		`${where}: timeout`,
	);
	const send = options.fetch ?? fetch;

	/** What the last attempt of a delivery got, for when it is given up. */
	type Failure = Omit<GivingUp, 'why'>;
	const waiting = new Map<
		ReturnType<typeof setTimeout>,
		{ readonly delivery: Delivery; readonly failed: Failure }
	>();
	const inFlight = new Set<Promise<void>>();
	let closed = false;

	const giveUp = async (delivery: Delivery, reason: GivingUp) => {
		const target = targets.find((one) => one.url === delivery.url);
		const warn = (message: string, code: string) =>
			process.emitWarning(message, { code });
		if (options.onGivingUp === undefined) {
			warn(
				`webhooks: gave up ${delivery.event.type} ${delivery.event.id} to ${target?.origin} after ${delivery.attempts} attempt${delivery.attempts === 1 ? '' : 's'} (${reason.why}, ${reason.status ?? reason.error ?? 'no answer'})`,
				'JANUS_WEBHOOK_GAVE_UP',
			);
			return;
		}
		try {
			await options.onGivingUp(delivery, reason);
		} catch (failure) {
			warn(
				`webhooks: onGivingUp failed on ${delivery.event.type} ${delivery.event.id}: ${failure instanceof Error ? failure.name : typeof failure}`,
				'JANUS_WEBHOOK_REPORT_FAILED',
			);
		}
	};

	/** One request; `null` when it succeeded, or what went wrong. */
	const post = async (
		target: Target,
		event: UserEvent,
	): Promise<Failure | null> => {
		const body = bodyOf(event);
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = target.keys
			.map((key) => sign(key, event.id, timestamp, body))
			.join(' ');
		try {
			const response = await send(target.url, {
				method: 'POST',
				body,
				redirect: 'manual',
				signal: AbortSignal.timeout(timeoutMs),
				headers: {
					'content-type': 'application/json',
					'webhook-id': event.id,
					'webhook-timestamp': String(timestamp),
					'webhook-signature': signature,
				},
			});
			await response.body?.cancel();
			return response.status >= 200 && response.status < 300
				? null
				: { status: response.status, error: null };
		} catch (failure) {
			return {
				status: null,
				error: failure instanceof Error ? failure.name : typeof failure,
			};
		}
	};

	const attempt = (target: Target, delivery: Delivery): void => {
		const run = (async () => {
			const failed = await post(target, delivery.event);
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
