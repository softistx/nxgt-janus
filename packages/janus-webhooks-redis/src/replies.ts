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
 * `@nxgt/janus` adds a fifth, which a queue must then read back too.
 */
const TYPES = {
	'user.created': true,
	'user.emailVerified': true,
	'user.passwordReset': true,
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
		date: (name: string) => new Date(digits(name, `a date in \`${name}\``)),
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
