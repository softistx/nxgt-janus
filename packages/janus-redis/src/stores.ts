import type { JanusStores, SessionStore, TokenStore } from '@nxgt/janus';
import { StoreFailure } from '@nxgt/janus';
import type { RedisConnection } from '@nxgt/redis';
import type { RedisClient } from 'bun';
import {
	type Call,
	count,
	stamp,
	stampOrEmpty,
	toSession,
	toToken,
} from './replies';
import {
	CONSUME_TOKEN,
	COUNT_ATTEMPT,
	DELETE_USER_SESSIONS,
	DELETE_USER_TOKENS,
	EXTEND_SESSION,
	FIND_SESSION,
	INSERT_SESSION,
	INSERT_TOKEN,
	REVOKE_SESSION,
	REVOKE_USER_SESSIONS,
	SPEND_USER_TOKENS,
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

/** Runs a script, and makes every rejection one the port allows. */
type Evaluate = (
	call: Call,
	script: string,
	args: readonly string[],
) => Promise<unknown>;

/** What a slot's methods call: a script's reply, already decoded. */
type Run = <T>(
	operation: string,
	script: string,
	args: readonly string[],
	decode: (reply: unknown, call: Call) => T,
) => Promise<T>;

function runner(evaluate: Evaluate, slot: Call['slot'], prefix: string): Run {
	return async (operation, script, args, decode) => {
		const call = { slot, operation };
		return decode(await evaluate(call, script, [prefix, ...args]), call);
	};
}

const ignore = () => undefined;

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

	return async ({ slot, operation }, script, args) => {
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
	const run = runner(evaluate, 'sessions', prefix);

	return {
		insertSession: (record) =>
			run(
				'insertSession',
				INSERT_SESSION,
				[
					record.id,
					record.tokenHash,
					record.userId,
					stamp(record.authenticatedAt),
					stamp(record.expiresAt),
					stampOrEmpty(record.revokedAt),
					stamp(record.createdAt),
				],
				ignore,
			),

		findSessionByTokenHash: (tokenHash) =>
			run('findSessionByTokenHash', FIND_SESSION, [tokenHash], toSession),

		extendSession: (id, expiresAt) =>
			run('extendSession', EXTEND_SESSION, [id, stamp(expiresAt)], toSession),

		revokeSession: (id, at) =>
			run(
				'revokeSession',
				REVOKE_SESSION,
				[id, stamp(at)],
				(reply, call) => count(reply, call) === 1,
			),

		revokeUserSessions: (userId, at, except) =>
			run(
				'revokeUserSessions',
				REVOKE_USER_SESSIONS,
				[userId, stamp(at), except ?? ''],
				count,
			),

		deleteUserSessions: (userId) =>
			run('deleteUserSessions', DELETE_USER_SESSIONS, [userId], count),
	};
}

function tokenStore(evaluate: Evaluate, prefix: string): TokenStore {
	const run = runner(evaluate, 'tokens', prefix);

	return {
		insertToken: (record) =>
			run(
				'insertToken',
				INSERT_TOKEN,
				[
					record.tokenHash,
					record.kind,
					record.userId,
					record.address,
					stamp(record.expiresAt),
					stampOrEmpty(record.spentAt),
					stamp(record.createdAt),
					record.codeHash ?? '',
					String(record.attempts),
				],
				ignore,
			),

		consumeToken: (tokenHash, kind, at) =>
			run(
				'consumeToken',
				CONSUME_TOKEN,
				[tokenHash, kind, stamp(at)],
				(reply, call) => toToken(reply, tokenHash, kind, call),
			),

		countAttempt: (tokenHash, kind) =>
			run('countAttempt', COUNT_ATTEMPT, [tokenHash, kind], (reply, call) =>
				toToken(reply, tokenHash, kind, call),
			),

		spendUserTokens: (userId, kind, at, except) =>
			run(
				'spendUserTokens',
				SPEND_USER_TOKENS,
				[userId, kind, stamp(at), except ?? ''],
				count,
			),

		deleteUserTokens: (userId) =>
			run('deleteUserTokens', DELETE_USER_TOKENS, [userId], count),
	};
}
