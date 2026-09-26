import type { SessionRecord, TokenRecord } from '@nxgt/janus';
import { StoreFailure } from '@nxgt/janus';

/**
 * What a script answers, read back into the port's records. **A reply this
 * adapter did not write is a failure, never an absence**: a key of the prefix
 * changed by hand, or written by another version, rejects with
 * `StoreFailure` — naming the call it failed, as every other failure does.
 *
 * Dates travel as milliseconds since the epoch, and `null` as `''`.
 */

/** The call a reply answers: what a failure names. */
export interface Call {
	readonly slot: 'sessions' | 'tokens';
	readonly operation: string;
}

export function stamp(at: Date): string {
	return String(at.getTime());
}

export function stampOrEmpty(at: Date | null): string {
	return at === null ? '' : stamp(at);
}

/** `[id, field, value, …]` as a session, or `null`. */
export function toSession(reply: unknown, call: Call): SessionRecord | null {
	if (reply === null) return null;
	if (!Array.isArray(reply) || typeof reply[0] !== 'string') {
		throw unreadable(call, 'a session');
	}
	const [id, ...rest] = reply as [string, ...unknown[]];
	const read = readerOf(rest, call);
	return {
		id,
		tokenHash: read.text('tokenHash'),
		userId: read.text('userId'),
		authenticatedAt: read.date('authenticatedAt'),
		expiresAt: read.date('expiresAt'),
		revokedAt: read.dateOrNull('revokedAt'),
		createdAt: read.date('createdAt'),
	};
}

/** `[field, value, …]` as the token `tokenHash` names, or `null`. */
export function toToken(
	reply: unknown,
	tokenHash: string,
	kind: TokenRecord['kind'],
	call: Call,
): TokenRecord | null {
	if (reply === null) return null;
	const read = readerOf(reply, call);
	if (read.text('kind') !== kind) throw unreadable(call, `a ${kind} token`);
	return {
		tokenHash,
		kind,
		userId: read.text('userId'),
		address: read.text('address'),
		// Absent on a token written before 0.3: read as none, and no attempt.
		codeHash: read.optional('codeHash') || null,
		attempts: read.count('attempts'),
		expiresAt: read.date('expiresAt'),
		spentAt: read.dateOrNull('spentAt'),
		createdAt: read.date('createdAt'),
	};
}

export function count(reply: unknown, call: Call): number {
	if (typeof reply !== 'number') throw unreadable(call, 'a count');
	return reply;
}

/** The fields of `[field, value, …]`, as Redis answers a hash from a script. */
function readerOf(reply: unknown, call: Call) {
	if (!Array.isArray(reply)) throw unreadable(call, 'a hash');
	const fields = new Map<string, string>();
	for (let i = 0; i + 1 < reply.length; i += 2) {
		fields.set(String(reply[i]), String(reply[i + 1]));
	}
	const text = (name: string): string => {
		const value = fields.get(name);
		if (value === undefined) throw unreadable(call, `a hash with \`${name}\``);
		return value;
	};
	const date = (name: string): Date => {
		const value = text(name);
		const at = new Date(Number(value));
		if (value === '' || Number.isNaN(at.getTime())) {
			throw unreadable(call, `a date in \`${name}\``);
		}
		return at;
	};
	return {
		text,
		date,
		optional: (name: string): string => fields.get(name) ?? '',
		count: (name: string): number => {
			const value = fields.get(name);
			if (value === undefined) return 0;
			const counted = Number(value);
			if (!Number.isSafeInteger(counted) || counted < 0) {
				throw unreadable(call, `a count in \`${name}\``);
			}
			return counted;
		},
		dateOrNull: (name: string): Date | null =>
			text(name) === '' ? null : date(name),
	};
}

function unreadable({ slot, operation }: Call, what: string): StoreFailure {
	return new StoreFailure(
		`${slot}.${operation}: a reply that is not ${what} — a key under the prefix this adapter did not write`,
		{ slot, operation },
	);
}
