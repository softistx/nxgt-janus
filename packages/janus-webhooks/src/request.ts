import type { UserEvent, UserEventType } from '@nxgt/janus';
import { isUserEventType, USER_EVENT_TYPES } from './event-types';
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
	/**
	 * What a queue knows the endpoint by: 1 to 64 letters, digits, `.`, `_`
	 * or `-`. Absent, a hash of the URL with a `queue`, and the endpoint's
	 * position in `endpoints` without one. Set it before changing the URL of
	 * an endpoint whose deliveries wait in a queue: a new URL is a new hash,
	 * and what waited for the old one is given up as `endpointRemoved`.
	 */
	readonly id?: string;
}

/** An endpoint, checked once when `webhooks()` is called. */
export interface Target {
	/** The endpoint's id: what a `Delivery` names. */
	readonly endpoint: string;
	/**
	 * What the queue holds its deliveries under: the id with a queue of the
	 * caller's, the position in `endpoints` without one.
	 */
	readonly key: string;
	readonly url: string;
	/** What a warning names: never the path or query, which may hold a token. */
	readonly origin: string;
	readonly keys: readonly Buffer[];
	readonly types: ReadonlySet<UserEventType> | null;
}

/** What an attempt that failed got: a status, or the failure's name. */
export interface Failure {
	/**
	 * The last attempt's response status, or `null` when it had none — or
	 * when no attempt was made.
	 */
	readonly status: number | null;
	/** The last failure's name — `TimeoutError`, `TypeError` — or `null`. */
	readonly error: string | null;
}

const LOCAL = new Set(['localhost', '127.0.0.1', '[::1]']);

/** What an endpoint's id may hold: nothing a warning would leak, no URL. */
const ID = /^[A-Za-z0-9._-]{1,64}$/;

/**
 * The endpoint checked, or a wiring refusal. `idOf` names it when it has no
 * `id` of its own, from its URL as `new URL()` writes it.
 */
export function targetOf(
	endpoint: WebhookEndpoint,
	where: string,
	idOf: (href: string) => string,
): Target {
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
	const secrets: unknown = endpoint.secrets;
	if (!Array.isArray(secrets) || secrets.length === 0) {
		throw new TypeError(`${where}: an endpoint needs at least one secret`);
	}
	const types: unknown = endpoint.types;
	if (
		types !== undefined &&
		(!Array.isArray(types) || !types.every(isUserEventType))
	) {
		throw new TypeError(
			`${where}: an endpoint's types are user event types — ${USER_EVENT_TYPES.join(', ')}`,
		);
	}
	const id: unknown = endpoint.id;
	if (id !== undefined && (typeof id !== 'string' || !ID.test(id))) {
		throw new TypeError(
			`${where}: an endpoint's id is 1 to 64 letters, digits, '.', '_' or '-'`,
		);
	}
	return {
		endpoint: id ?? idOf(url.href),
		key: id ?? idOf(url.href),
		url: url.href,
		origin: url.origin,
		keys: secrets.map((secret) => keyOf(secret, where)),
		types: types === undefined ? null : new Set(types),
	};
}

/**
 * The body of an event, or a `TypeError`: an event rebuilt by hand that is
 * not one — a type janus never sends, a missing id, an `occurredAt` that is
 * not a date — is the caller's mistake, never a failure worth a retry: every
 * receiver would refuse it.
 */
export function bodyFor(event: UserEvent, where: string): string {
	const { id, type, userId, userType } = (event ?? {}) as Partial<UserEvent>;
	if (
		!isUserEventType(type) ||
		typeof id !== 'string' ||
		typeof userId !== 'string' ||
		typeof userType !== 'string'
	) {
		throw new TypeError(
			`${where}: the listener takes a user event — an id, one of ${USER_EVENT_TYPES.join(', ')}, a userId and a userType`,
		);
	}
	const at: unknown = event.occurredAt;
	if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
		throw new TypeError(`${where}: an event's occurredAt is a valid Date`);
	}
	return bodyOf(event);
}

/**
 * What a webhook keeps of an event: the user named by id, and nothing else.
 * `formerEmail`, on `user.emailChanged`, and `sessionId`, on
 * `user.newDeviceSignedIn`, stay in the process that wrote them — past here
 * they would sit in the queue, in every endpoint's logs and in
 * `onGivingUp`'s reports.
 */
export function deliverable(event: UserEvent): UserEvent {
	const { id, type, occurredAt, userId, userType } = event;
	return { id, type, occurredAt, userId, userType };
}

/**
 * One attempt: the body signed and posted. `null` when it succeeded — a
 * `2xx`, and nothing else — or what went wrong. It never rejects.
 */
export async function post(
	target: Target,
	event: UserEvent,
	body: string,
	send: typeof fetch,
	timeoutMs: number,
): Promise<Failure | null> {
	try {
		// Signed at each attempt: a retry hours later is not a replay.
		const timestamp = Math.floor(Date.now() / 1000);
		const signature = target.keys
			.map((key) => sign(key, event.id, timestamp, body))
			.join(' ');
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
		// Read nothing of the answer, and let a body that will not close
		// cost nothing: the status is the whole answer.
		void response.body?.cancel().catch(() => undefined);
		return response.status >= 200 && response.status < 300
			? null
			: { status: response.status, error: null };
	} catch (failure) {
		return {
			status: null,
			error: failure instanceof Error ? failure.name : typeof failure,
		};
	}
}
