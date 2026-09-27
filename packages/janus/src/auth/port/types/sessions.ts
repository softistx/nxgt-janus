/**
 * The sessions store: a session's record, and the port a store implements for
 * them.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./index`.
 */

import type { Id } from '../../../ids/id';

/** A session's id: a UUIDv7 minted by the core, as a user's is. */
export type SessionId = string;

/**
 * A session, as a store holds it.
 *
 * **No secret is stored, ever.** The core mints 32 random bytes, hands the store
 * `sha256(secret)` as `tokenHash`, and gives the plain secret to the
 * application once. A dump of the store cannot be replayed.
 */
export interface SessionRecord {
	readonly id: SessionId;
	/** `sha256` of the session token, hex. Unique across the store. */
	readonly tokenHash: string;
	readonly userId: Id;
	/** When credentials were last presented — not when the session was last extended. */
	readonly authenticatedAt: Date;
	readonly expiresAt: Date;
	/** `null` while the session stands. */
	readonly revokedAt: Date | null;
	readonly createdAt: Date;
}

/**
 * Sessions. Derived state: losing them all signs everybody out, which recovers.
 *
 * **Expiry is the core's decision, not the store's.** A store may still hold a
 * lapsed session or may already have dropped it — a TTL index is an
 * optimisation, and this interface treats it as one. A read answers a present
 * record **verbatim**, lapsed or revoked, and may answer `null` once its expiry
 * has passed. What it must never do is answer a record it has *changed*.
 */
export interface SessionStore {
	/**
	 * Stores a new session. Idempotent under retry: when a session with this id
	 * exists, it writes nothing.
	 */
	insertSession(record: SessionRecord): Promise<void>;

	/** The session whose token hashes to this, verbatim, or `null`. */
	findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;

	/**
	 * Moves `expiresAt`, **only while the session is not revoked**, and answers
	 * the record as written.
	 *
	 * `null` when there is no such session or it has been revoked — an extension
	 * racing a revocation must never bring the session back. Whether it is
	 * *allowed* to be extended yet is the core's decision, made before the call.
	 */
	extendSession(id: SessionId, expiresAt: Date): Promise<SessionRecord | null>;

	/**
	 * Revokes one session. `true` when the session exists — revoked by this call
	 * or already — and `false` when there is none.
	 *
	 * A session already revoked keeps its first `revokedAt`.
	 */
	revokeSession(id: SessionId, at: Date): Promise<boolean>;

	/**
	 * Revokes every standing session of one user, except `except` when given —
	 * "sign out everywhere else". Answers how many this call revoked; `0` is an
	 * answer, not a failure.
	 */
	revokeUserSessions(userId: Id, at: Date, except?: SessionId): Promise<number>;

	/**
	 * Deletes every session of one user — standing, revoked or lapsed — and
	 * answers how many. `0` is an answer, not a failure. What deleting a user
	 * calls: a revoked session still names who held it. A lapsed session the
	 * store already dropped is not there to count.
	 */
	deleteUserSessions(userId: Id): Promise<number>;

	/**
	 * **Optional capability.** Deletes every session whose `expiresAt` is at or
	 * before `before`, and answers how many.
	 *
	 * A store with its own expiry — a TTL index, a key TTL — does not implement
	 * it. The core reads its presence rather than assuming it, and
	 * `collectExpired()` throws `UNSUPPORTED`, naming this method and the
	 * `sessions` slot, when it is absent.
	 */
	deleteExpiredSessions?(before: Date): Promise<number>;
}
