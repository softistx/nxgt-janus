import type { UserEvent, UserEventType } from '@nxgt/janus';
import { isUserEventType } from './event-types';
import { keyOf, signedBy } from './signature';

/**
 * The body of a webhook: the Standard Webhooks envelope — `type`,
 * `timestamp`, `data` — around what the event carries. The user named by id,
 * and nothing else; the event's own id travels as the `webhook-id` header.
 */
export interface WebhookBody {
	readonly type: UserEventType;
	/** When the write landed, ISO 8601. */
	readonly timestamp: string;
	readonly data: {
		readonly userId: string;
		readonly userType: string;
	};
}

export function bodyOf(event: UserEvent): string {
	const body: WebhookBody = {
		type: event.type,
		timestamp: event.occurredAt.toISOString(),
		data: { userId: event.userId, userType: event.userType },
	};
	return JSON.stringify(body);
}

/** A request's headers, as a fetch `Request` or a Node handler holds them. */
export type HeadersLike =
	| Headers
	| Readonly<Record<string, string | readonly string[] | undefined>>;

export interface VerifyOptions {
	/** The endpoint's secrets: every one is tried, so a rotation drops none. */
	readonly secrets: readonly [string, ...string[]];
	readonly headers: HeadersLike;
	/** The body **as received**, before any parsing: the signature covers its bytes. */
	readonly body: string;
	/** How far `webhook-timestamp` may be from now. `300` seconds when absent. */
	readonly toleranceSeconds?: number;
	/** `new Date()` when absent. */
	readonly now?: Date;
}

/** One header by its lower-case name, whatever the case of the record's keys. */
function header(headers: HeadersLike, name: string): string | null {
	if (headers instanceof Headers) return headers.get(name);
	const key = Object.keys(headers).find((one) => one.toLowerCase() === name);
	const value = key === undefined ? undefined : headers[key];
	if (Array.isArray(value)) return value.join(' ');
	return typeof value === 'string' ? value : null;
}

/**
 * The user event a webhook carries, or `null` when it is not one this
 * endpoint's secrets signed — a forged or altered body, a missing header, a
 * timestamp outside the tolerance (a replay), a body that is not a user
 * event. Answer `null` with 400 or 401, and never act on it.
 *
 * A **replay inside the tolerance** passes: keep the `id`s already handled —
 * it is what the id is for — and ignore a second.
 */
export function verifyWebhook(options: VerifyOptions): UserEvent | null {
	const where = 'verifyWebhook';
	const secrets: unknown = options?.secrets;
	if (!Array.isArray(secrets) || secrets.length === 0) {
		throw new TypeError(`${where}: pass the endpoint's secrets — at least one`);
	}
	const keys = secrets.map((secret) => keyOf(secret, where));
	// The one check that stops a replay: a NaN here would let every
	// timestamp through, so it is refused as wiring.
	const tolerance = options.toleranceSeconds ?? 300;
	if (!Number.isFinite(tolerance) || tolerance < 0) {
		throw new TypeError(
			`${where}: toleranceSeconds is a finite number of seconds, 0 or more`,
		);
	}
	const at: unknown = options.now ?? new Date();
	if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
		throw new TypeError(`${where}: now is a valid Date`);
	}
	const now = Math.floor(at.getTime() / 1000);

	const id = header(options.headers, 'webhook-id');
	const stamp = header(options.headers, 'webhook-timestamp');
	const signature = header(options.headers, 'webhook-signature');
	if (id === null || stamp === null || signature === null) return null;
	if (!/^\d{1,12}$/.test(stamp)) return null;
	const timestamp = Number(stamp);
	if (Math.abs(now - timestamp) > tolerance) return null;
	if (!signedBy(keys, signature, id, timestamp, options.body)) return null;

	return eventOf(id, options.body);
}

/** The event a signed body holds, read field by field; `null` for anything else. */
function eventOf(id: string, body: string): UserEvent | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(body);
	} catch {
		return null;
	}
	if (typeof parsed !== 'object' || parsed === null) return null;
	const { type, timestamp, data } = parsed as Record<string, unknown>;
	if (!isUserEventType(type)) return null;
	if (typeof timestamp !== 'string') return null;
	const occurredAt = new Date(timestamp);
	if (Number.isNaN(occurredAt.getTime())) return null;
	if (typeof data !== 'object' || data === null) return null;
	const { userId, userType } = data as Record<string, unknown>;
	if (typeof userId !== 'string' || typeof userType !== 'string') return null;

	return Object.freeze({
		id,
		type,
		occurredAt,
		userId,
		userType,
	});
}
