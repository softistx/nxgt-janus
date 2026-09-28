import { StoreFailure, type UserEvent, type UserEventType } from '@nxgt/janus';
import type {
	Failure,
	QueuedDelivery,
	WebhookQueue,
} from '@nxgt/janus-webhooks';

/** A method of the queue port: what a failure names. */
export type Method = keyof WebhookQueue & string;

/**
 * What a script answers, read back into the port's deliveries. **A reply
 * this adapter did not write is a failure, never an absence**: a key of the
 * prefix changed by hand, or written by another version, rejects with
 * `StoreFailure` — naming the method it failed, as every other failure does.
 *
 * Dates travel as milliseconds since the epoch, and `null` as `''`.
 */

export function stamp(at: Date): string {
	return String(at.getTime());
}

/**
 * A time the caller passed, as milliseconds — or a `TypeError`, before any
 * I/O, for an Invalid Date: `stamp` would write `'NaN'`, which no claim could
 * read back. A date before 1970 is a negative number, and reads back.
 */
export function stampOf(at: Date, operation: Method, name: string): string {
	if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
		throw new TypeError(`webhookQueue.${operation}: ${name} is a valid Date`);
	}
	return stamp(at);
}

/** A claim's `limit`, or a `TypeError`: a whole number of deliveries, 0 or more. */
export function limitOf(limit: number, operation: Method): string {
	if (!Number.isSafeInteger(limit) || limit < 0) {
		throw new TypeError(
			`webhookQueue.${operation}: limit is a whole number of deliveries, 0 or more`,
		);
	}
	return String(limit);
}

/** A failure's `status`, or a `TypeError`: `null`, or a whole number. */
export function statusOf(status: number | null, operation: Method): string {
	if (status === null) return '';
	if (!Number.isSafeInteger(status) || status < 0) {
		throw new TypeError(
			`webhookQueue.${operation}: failed.status is null or a whole number`,
		);
	}
	return String(status);
}

/** `[[id, field, value, …], …]` as the deliveries a claim took. */
export function toDeliveries(
	reply: unknown,
	operation: Method,
): QueuedDelivery[] {
	if (!Array.isArray(reply)) throw unreadable(operation, 'a list');
	return reply.map((one) => toDelivery(one, operation));
}

/** `1` as `true`, `0` as `false`: what a write guarded by a lease answers. */
export function toHeld(reply: unknown, operation: Method): boolean {
	if (reply !== 0 && reply !== 1) throw unreadable(operation, '0 or 1');
	return reply === 1;
}

export function toCount(reply: unknown, operation: Method): number {
	if (!Number.isSafeInteger(reply) || (reply as number) < 0) {
		throw unreadable(operation, 'a count');
	}
	return reply as number;
}

function toDelivery(reply: unknown, operation: Method): QueuedDelivery {
	if (!Array.isArray(reply) || typeof reply[0] !== 'string') {
		throw unreadable(operation, 'a delivery');
	}
	const [id, ...rest] = reply as [string, ...unknown[]];
	const read = readerOf(rest, operation);
	const lease = read.text('lease');
	if (lease === '') throw unreadable(operation, 'a delivery claimed');
	const event: UserEvent = {
		id: read.text('eventId'),
		type: read.type('type'),
		occurredAt: read.date('occurredAt'),
		userId: read.text('userId'),
		userType: read.text('userType'),
	};
	return {
		id,
		event,
		endpoint: read.text('endpoint'),
		attempts: read.count('attempts'),
		failed: read.failure(),
		lease,
	};
}

/**
 * Every user event type, once: `satisfies` fails to compile the day
 * `@nxgt/janus` adds a ninth, which a queue must then read back too.
 */
const TYPES = {
	'user.created': true,
	'user.emailVerified': true,
	'user.passwordReset': true,
	'user.secondFactorEnabled': true,
	'user.secondFactorDisabled': true,
	'user.recoveryCodesRegenerated': true,
	'user.recoveryCodeUsed': true,
	'user.deleted': true,
} as const satisfies Record<UserEventType, true>;

/** The fields of `[field, value, …]`, as Redis answers a hash from a script. */
function readerOf(reply: readonly unknown[], operation: Method) {
	const fields = new Map<string, string>();
	for (let i = 0; i + 1 < reply.length; i += 2) {
		fields.set(String(reply[i]), String(reply[i + 1]));
	}
	const text = (name: string): string => {
		const value = fields.get(name);
		if (value === undefined) {
			throw unreadable(operation, `a hash with \`${name}\``);
		}
		return value;
	};
	/** Only what this adapter writes: digits. `Number()` would take '' and '1e1'. */
	const digits = (name: string, what: string): number => {
		const value = text(name);
		const read = /^(0|[1-9]\d*)$/.test(value) ? Number(value) : Number.NaN;
		if (!Number.isSafeInteger(read)) throw unreadable(operation, what);
		return read;
	};
	return {
		text,
		count: (name: string) => digits(name, `a count in \`${name}\``),
		/** As `@nxgt/janus-redis` reads one: before 1970 is negative; '' and 'NaN' are not dates. */
		date: (name: string): Date => {
			const value = text(name);
			const at = new Date(Number(value));
			if (value === '' || Number.isNaN(at.getTime())) {
				throw unreadable(operation, `a date in \`${name}\``);
			}
			return at;
		},
		type: (name: string): UserEventType => {
			const value = text(name);
			if (!Object.hasOwn(TYPES, value))
				throw unreadable(operation, 'a user event type');
			return value as UserEventType;
		},
		/** `null` before any attempt failed: then neither field is written. */
		failure: (): Failure | null => {
			if (!fields.has('status') && !fields.has('error')) return null;
			const status = text('status');
			const error = text('error');
			return {
				status: status === '' ? null : digits('status', 'a status in `status`'),
				error: error === '' ? null : error,
			};
		},
	};
}

function unreadable(operation: Method, what: string): StoreFailure {
	return new StoreFailure(
		`webhookQueue.${operation}: a reply that is not ${what} — a key under the prefix this adapter did not write`,
		{ operation },
	);
}
