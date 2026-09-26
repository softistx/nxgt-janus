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
}

/** An endpoint, checked once when `webhooks()` is called. */
export interface Target {
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

export function targetOf(endpoint: WebhookEndpoint, where: string): Target {
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
	return {
		url: url.href,
		origin: url.origin,
		keys: secrets.map((secret) => keyOf(secret, where)),
		types: types === undefined ? null : new Set(types),
	};
}

/**
 * One attempt: the event signed and posted. `null` when it succeeded — a
 * `2xx`, and nothing else — or what went wrong. It never rejects: an event
 * whose body cannot be built fails like a request that could not be sent.
 */
export async function post(
	target: Target,
	event: UserEvent,
	send: typeof fetch,
	timeoutMs: number,
): Promise<Failure | null> {
	try {
		const body = bodyOf(event);
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
