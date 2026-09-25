import type {
	Id,
	JanusStores,
	SessionRecord,
	SessionStore,
	TokenRecord,
	TokenStore,
} from '@nxgt/janus';
import { StoreFailure } from '@nxgt/janus';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisClient } from 'bun';
import {
	CONSUME_TOKEN,
	DELETE_USER_SESSIONS,
	DELETE_USER_TOKENS,
	EXTEND_SESSION,
	FIND_SESSION,
	INSERT_SESSION,
	INSERT_TOKEN,
	REVOKE_SESSION,
	REVOKE_USER_SESSIONS,
} from './scripts';

/** What the stores take besides the connection. */
export interface RedisStoresOptions {
	/**
	 * What every key starts with — `janus:` unless you say otherwise. Two
	 * applications sharing one Redis each take their own.
	 */
	readonly prefix?: string;
}

/** The two slots of `janus()`'s `store` that Redis serves. */
export type RedisStores = Pick<JanusStores, 'sessions' | 'tokens'>;

/**
 * Sessions and one-time tokens, over one Redis, on `@nxgt/redis`'s
 * connection. **Users stay in another store**: a user is written once and
 * read on sign-in; a session is read on every request, which is what Redis
 * is for.
 *
 * ```ts
 * const redis = await connectRedis(process.env.REDIS_URL);
 * const auth = janus({
 *   user, password: { login: 'email' }, hasher,
 *   store: { ...createMongoStores(db), ...createRedisStores(redis) },
 * });
 * ```
 *
 * **Redis expires them itself**: every session and token key expires at its
 * own `expiresAt`. So `sessions.deleteExpiredSessions` is not implemented,
 * and `auth.collectExpired()` answers `UNSUPPORTED` — there is nothing to
 * collect. **Every method that writes is one Lua script**, atomic as the port
 * asks, so `consumeToken` is never a read and then a write.
 *
 * It creates nothing and needs no schema: the keys are made by the first
 * write.
 */
export function createRedisStores(
	redis: RedisConnection,
	options: RedisStoresOptions = {},
): RedisStores {
	const prefix = options.prefix ?? 'janus:';
	const scripts = scriptsOver(redis.client);
	return {
		sessions: sessionStore(scripts, prefix),
		tokens: tokenStore(scripts, prefix),
	};
}

type Slot = 'sessions' | 'tokens';

/** Runs a script, and makes every rejection one the port allows. */
type Evaluate = (
	slot: Slot,
	operation: string,
	script: string,
	args: readonly string[],
) => Promise<unknown>;

/**
 * Each script is sent once by its SHA — `EVALSHA` — and in full only when
 * Redis answers `NOSCRIPT`: after a restart, a failover, or a `SCRIPT FLUSH`.
 * Every other error is a failure, and nothing is ever answered as an absence.
 */
function scriptsOver(client: RedisClient): Evaluate {
	const shas = new Map<string, string>();
	const shaOf = (script: string) => {
		let sha = shas.get(script);
		if (sha === undefined) {
			sha = new Bun.CryptoHasher('sha1').update(script).digest('hex');
			shas.set(script, sha);
		}
		return sha;
	};

	return async (slot, operation, script, args) => {
		try {
			try {
				return await client.send('EVALSHA', [shaOf(script), '0', ...args]);
			} catch (error) {
				if (!isNoScript(error)) throw error;
				return await client.send('EVAL', [script, '0', ...args]);
			}
		} catch (error) {
			throw new StoreFailure(
				`${slot}.${operation}: the store could not answer`,
				{ slot, operation, cause: error },
			);
		}
	};
}

function isNoScript(error: unknown): boolean {
	return error instanceof Error && error.message.startsWith('NOSCRIPT');
}

function sessionStore(evaluate: Evaluate, prefix: string): SessionStore {
	const run = (operation: string, script: string, args: readonly string[]) =>
		evaluate('sessions', operation, script, [prefix, ...args]);

	return {
		insertSession: async (record) => {
			await run('insertSession', INSERT_SESSION, [
				record.id,
				record.tokenHash,
				record.userId,
				stamp(record.authenticatedAt),
				stamp(record.expiresAt),
				stampOrEmpty(record.revokedAt),
				stamp(record.createdAt),
			]);
		},

		findSessionByTokenHash: async (tokenHash) =>
			toSession(await run('findSessionByTokenHash', FIND_SESSION, [tokenHash])),

		extendSession: async (id, expiresAt) =>
			toSession(
				await run('extendSession', EXTEND_SESSION, [id, stamp(expiresAt)]),
			),

		revokeSession: async (id, at) =>
			(await run('revokeSession', REVOKE_SESSION, [id, stamp(at)])) === 1,

		revokeUserSessions: async (userId, at, except) =>
			count(
				await run('revokeUserSessions', REVOKE_USER_SESSIONS, [
					userId,
					stamp(at),
					except ?? '',
				]),
			),

		deleteUserSessions: async (userId) =>
			count(await run('deleteUserSessions', DELETE_USER_SESSIONS, [userId])),
	};
}

function tokenStore(evaluate: Evaluate, prefix: string): TokenStore {
	const run = (operation: string, script: string, args: readonly string[]) =>
		evaluate('tokens', operation, script, [prefix, ...args]);

	return {
		insertToken: async (record) => {
			await run('insertToken', INSERT_TOKEN, [
				record.tokenHash,
				record.kind,
				record.userId,
				record.address,
				stamp(record.expiresAt),
				stampOrEmpty(record.spentAt),
				stamp(record.createdAt),
			]);
		},

		consumeToken: async (tokenHash, kind, at) => {
			const before = await run('consumeToken', CONSUME_TOKEN, [
				tokenHash,
				kind,
				stamp(at),
			]);
			if (before === null) return null;
			const fields = fieldsOf(before);
			return {
				tokenHash,
				kind: fields.kind as TokenRecord['kind'],
				userId: fields.userId as Id,
				address: fields.address ?? '',
				expiresAt: dateOf(fields.expiresAt),
				spentAt: dateOrNull(fields.spentAt),
				createdAt: dateOf(fields.createdAt),
			};
		},

		deleteUserTokens: async (userId) =>
			count(await run('deleteUserTokens', DELETE_USER_TOKENS, [userId])),
	};
}

// ─── Replies and records ──────────────────────────────────────────────────

function stamp(at: Date): string {
	return String(at.getTime());
}

function stampOrEmpty(at: Date | null): string {
	return at === null ? '' : stamp(at);
}

/** `[id, field, value, …]` as a session, or `null`. */
function toSession(reply: unknown): SessionRecord | null {
	if (reply === null) return null;
	if (!Array.isArray(reply) || typeof reply[0] !== 'string') {
		throw unreadable('a session');
	}
	const [id, ...rest] = reply as [string, ...string[]];
	const fields = fieldsOf(rest);
	return {
		id,
		tokenHash: fields.tokenHash ?? '',
		userId: fields.userId as Id,
		authenticatedAt: dateOf(fields.authenticatedAt),
		expiresAt: dateOf(fields.expiresAt),
		revokedAt: dateOrNull(fields.revokedAt),
		createdAt: dateOf(fields.createdAt),
	};
}

/** `[field, value, …]`, as Redis answers a hash from a script. */
function fieldsOf(reply: unknown): Record<string, string | undefined> {
	if (!Array.isArray(reply)) throw unreadable('a hash');
	const fields: Record<string, string> = {};
	for (let i = 0; i + 1 < reply.length; i += 2) {
		fields[String(reply[i])] = String(reply[i + 1]);
	}
	return fields;
}

function dateOf(value: string | undefined): Date {
	const date = new Date(Number(value));
	if (value === undefined || value === '' || Number.isNaN(date.getTime())) {
		throw unreadable('a date');
	}
	return date;
}

function dateOrNull(value: string | undefined): Date | null {
	return value === '' ? null : dateOf(value);
}

function count(reply: unknown): number {
	if (typeof reply !== 'number') throw unreadable('a count');
	return reply;
}

/**
 * A reply this adapter did not write: a key of the prefix changed by hand, or
 * written by another version. A failure, never an absence.
 */
function unreadable(what: string): StoreFailure {
	return new StoreFailure(
		`janus-redis: a reply that is not ${what}, under this adapter's prefix`,
	);
}
