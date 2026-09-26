/**
 * The store port: what an adapter implements, and nothing else.
 *
 * **This is the contract strangers are asked to implement**, so every line of
 * it is a promise. It is small on purpose — anything the core can derive from
 * what the port already offers (merging fields, deciding that an e-mail is no
 * longer verified, deciding that a session has lapsed) lives in the core, where
 * it is written once, rather than here, where every adapter would write it
 * again, differently.
 *
 * ## The six rules an implementation keeps
 *
 * All of them are checked by `@nxgt/janus/conformance`.
 *
 * 1. **An absence is `null`. A failure throws.** A method that can
 *    legitimately find nothing answers `null`, `false`, `0` or an empty page.
 *    Everything else — a refused connection, a timeout, a primary stepping
 *    down, a bug in the adapter — **throws**, preferably `StoreFailure` with
 *    the driver error as `cause`. Never write `try { … } catch { return null }`
 *    in an implementation of this port: that one line turns an outage into
 *    "no such user", and every caller above it answers 404 to a user who
 *    exists.
 * 2. **`null`, not `undefined`.** `undefined` is what a missing property and a
 *    function with no `return` both produce, so a store that forgot to answer
 *    would report "not found" by accident. `null` has to be written on purpose.
 * 3. **Uniqueness is yours, and it is a constraint.** A unique index, a
 *    constraint, an atomic `SET NX` — never a read followed by a write, which
 *    two concurrent sign-ups both pass.
 * 4. **Bytes round-trip.** Logins, hashes and fields come back exactly as they
 *    were written: no normalisation, no trimming, no `1` turned into `'1'`. The
 *    core normalises a login before a store ever sees it, so uniqueness is
 *    uniqueness of bytes and no adapter needs a collation. The core never
 *    hands a store `\u0000` or a lone surrogate — PostgreSQL keeps neither —
 *    and every other character must come back as it went in.
 * 5. **Every method is atomic on its own.** Nothing composes into a
 *    transaction, and the core never opens one. An adapter may open one
 *    *inside* a method — a normalised SQL schema writes several rows per
 *    user — but the port exposes none.
 * 6. **Schema management is not on this interface.** An adapter exposes its own
 *    `sync()`; the core never calls it.
 *
 * ## Why three stores and not one
 *
 * The seam is **where atomicity is not required**. A user and their password
 * are written together — a sign-up that stores the user and loses the hash is
 * a user nobody can sign in as — so they are one record. A session is derived
 * state: losing them all signs everybody out, which recovers. A one-time token
 * is ephemeral by construction. So `sessions` and `tokens` may live in Redis
 * while `users` lives in MongoDB, with no distributed transaction anywhere.
 *
 * ## Why the port is not generic
 *
 * A store does not know the application's schemas, and must not have to:
 * fields are a {@link JsonObject} here, and the core casts once, at the
 * boundary, after the schema has validated them. That is the shape `nxgt-data`
 * uses — a generic public form, a degenericised mirror inside — and it keeps
 * every adapter free of type parameters it could only pass through.
 */

import type { Id } from '../../ids/id';
import type { CursorPage } from '../../pagination/cursor-page';

/**
 * A value a store must be able to round-trip byte for byte.
 *
 * JSON and nothing else. A `Date` inside fields round-trips through MongoDB and
 * not through a JSON column or Redis, so an adapter could pass the conformance
 * suite on one database and corrupt fields on the next. The record's own
 * timestamps are `Date`s, because every adapter stores those in a column it
 * chose for them.
 */
export type Json =
	| string
	| number
	| boolean
	| null
	| readonly Json[]
	| JsonObject;

/**
 * An object of {@link Json} values.
 *
 * An `interface` declared by the application is not assignable to this — an
 * index signature is only satisfied by a type alias. The core never asks a
 * caller to write one: it casts at the boundary, after validation.
 */
export type JsonObject = { readonly [key: string]: Json };

/** A password, as the store holds it: a self-describing hash, never the plain text. */
export interface PasswordRecord {
	/** Self-describing — `$argon2id$…`, `$scrypt$…` — so any wired verifier can read it. */
	readonly hash: string;
	readonly updatedAt: Date;
}

/**
 * A second factor, as the store holds it: a TOTP secret.
 *
 * **The secret is opaque to a store.** Once the second factor ships, the core
 * will seal it with a key the application holds before a store ever sees it,
 * so a dump of the users cannot produce a code. A store keeps the string byte
 * for byte, like a password hash, and never parses it.
 */
export interface SecondFactorRecord {
	/** How the codes are made. `'totp'`, the codes of an authenticator app, is the only one. */
	readonly method: 'totp';
	/** The secret, opaque to a store: kept byte for byte. */
	readonly secret: string;
	/**
	 * When the user proved their app holds the secret, with a first code — or
	 * `null` while the enrolment waits for it. A second factor is asked for at
	 * sign-in only once confirmed.
	 */
	readonly confirmedAt: Date | null;
	/**
	 * The time step of the last code accepted, or `null` before the first. A
	 * code of this step or an earlier one is refused, so a code works once.
	 */
	readonly lastStep: number | null;
}

/**
 * A user, as a store holds it.
 *
 * Everything is `readonly`: the core hands records to application code, and a
 * mutation would not reach the store — it could only mislead whoever wrote it.
 */
export interface UserRecord {
	/** A UUIDv7 minted by the core. The store never mints an id. */
	readonly id: Id;
	/**
	 * Which of the application's user types — `'patient'`, `'staff'`, or
	 * `'user'` when it declares one. Never changes after insertion.
	 */
	readonly type: string;
	/**
	 * Which version of the type's schema these fields were last validated
	 * against.
	 *
	 * **Nothing reads it yet**, and it is here from v1 on purpose. Tightening a
	 * schema changes what an update accepts, and every stored user was validated
	 * against the old one: without this field there is no way to find the users
	 * that are now unmodifiable. Adding a field to the port later breaks every
	 * adapter; adding it now costs one column.
	 */
	readonly schemaVersion: string;
	/** `false` keeps the record and its password, and refuses every sign-in. */
	readonly active: boolean;
	/** The application's own fields, as the type's schema validated them. */
	readonly fields: JsonObject;
	/**
	 * What the user signs in with, **already normalised** by the core. Unique
	 * per `type`, and that uniqueness is a constraint the store enforces
	 * (rule 3): the same e-mail may hold a patient user and a staff user,
	 * and never two of either.
	 */
	readonly logins: readonly string[];
	/** `null` when the user has no password. */
	readonly password: PasswordRecord | null;
	/** `null` when the user has no second factor. */
	readonly secondFactor: SecondFactorRecord | null;
	/**
	 * When the user proved they hold their current e-mail, or `null`. The core
	 * sets it back to `null` in the same write that changes the e-mail.
	 */
	readonly emailVerifiedAt: Date | null;
	/**
	 * `0` at insertion, and one more on every accepted write. What
	 * {@link UserStore.updateUser}'s `ifVersion` is compared against.
	 */
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * What one {@link UserStore.updateUser} changes.
 *
 * **A field the patch does not name is left as it is.** There is no full
 * replacement of a record anywhere on this port: in Kratos, an update that
 * omits `state` deactivates the identity, and an edit form that omits a trait
 * deletes it. A conformance case carries that trap's name.
 *
 * A field the patch *does* name is replaced whole — `fields` and `logins`
 * included. A deep merge would make every adapter implement a merge on nested
 * values, differently on every database. The core computes the next value from
 * the record it just read, under `ifVersion`, so no write is lost by it.
 *
 * `password: null` removes the password; a patch that does not name `password`
 * keeps it.
 *
 * `id`, `type`, `version` and `createdAt` are not patchable. `updatedAt` is
 * **required**, and comes from the core's clock rather than the database's, so
 * every timestamp on a record comes from one clock.
 *
 * A key present with the value `undefined` is absent. This package is compiled
 * with `exactOptionalPropertyTypes`, so the core cannot write one; an adapter
 * receiving one from JavaScript still treats it as absent, never as an erasure.
 */
export interface UserPatch {
	readonly updatedAt: Date;
	readonly schemaVersion?: string;
	readonly active?: boolean;
	readonly fields?: JsonObject;
	readonly logins?: readonly string[];
	readonly password?: PasswordRecord | null;
	readonly secondFactor?: SecondFactorRecord | null;
	readonly emailVerifiedAt?: Date | null;
}

/** Which users a page lists, where it starts, and how much of it to read. */
export interface UserPageRequest {
	/** Only users of this type. */
	readonly type: string;
	/**
	 * The last id of the previous page, or `null` for the first.
	 *
	 * Already checked by the core to be an id this package could have minted,
	 * so the store never parses a cursor. It need not name a stored user: the
	 * page is every id strictly greater than it.
	 */
	readonly after: Id | null;
	/** Already bounded by the core, between 1 and `MAX_PAGE_SIZE`. */
	readonly limit: number;
}

/** Users and their passwords: one unit of atomicity. */
export interface UserStore {
	/**
	 * Stores a new user, verbatim, and answers what is stored.
	 *
	 * **Idempotent under retry.** When a user with this `id` already exists, it
	 * answers the stored record and writes nothing — a retry after a timeout
	 * whose first attempt landed is a success, not a conflict. That includes the
	 * logins: a login held by the user with this same `id` is not taken.
	 *
	 * A login held by **another** user of the same type rejects with
	 * `StoreConflict('login', …)`, carrying `login` and `userType` — never the
	 * login in its message — and writes nothing. That refusal comes from the store's own constraint, never from a
	 * read made first.
	 */
	insertUser(record: UserRecord): Promise<UserRecord>;

	/** The user with this id, whatever their type, or `null`. */
	findUser(id: Id): Promise<UserRecord | null>;

	/**
	 * The user of this type holding this login, or `null`.
	 *
	 * `login` is compared byte for byte: the core normalised it with the same
	 * rule it used when the login was written.
	 */
	findUserByLogin(type: string, login: string): Promise<UserRecord | null>;

	/**
	 * One page of users of one type, in ascending id order — which is creation
	 * order.
	 *
	 * `nextCursor` is the last id of the page when more follow, and `null` on
	 * the last page. An empty store answers an empty page, never `null`.
	 */
	listUsers(page: UserPageRequest): Promise<CursorPage<UserRecord>>;

	/**
	 * Applies a patch, **only if the stored version is exactly `ifVersion`**,
	 * and answers the record as written, with `version` one higher.
	 *
	 * `ifVersion` is required: every update in the core comes from a record it
	 * has just read, so a version is always at hand — and an optional check is
	 * the one somebody forgets on the one write where it mattered. An adapter
	 * therefore has no unchecked path to write.
	 *
	 * Rejects, **writing nothing**, with:
	 *
	 * - `NotFoundError` when no user has this id. The one method on this port
	 *   that throws for an absence: it always follows a read, so an absence here
	 *   is a race, not an answer;
	 * - `StoreConflict('version', …)` with `expectedVersion` and
	 *   `actualVersion` when the version moved. A conditional write cannot tell
	 *   this from an absent id on its own, so the adapter reads again after a
	 *   write that matched nothing;
	 * - `StoreConflict('login', …)` when the patch's logins collide with another
	 *   user's of the same type, carrying `login` and `userType` — never the
	 *   login in its message.
	 */
	updateUser(id: Id, patch: UserPatch, ifVersion: number): Promise<UserRecord>;

	/**
	 * Deletes the user with this id, whatever their type, and frees their
	 * logins. `true` when there was one, `false` when there was none.
	 *
	 * **Idempotent**, so a deletion interrupted half-way can be replayed: the
	 * replay answers `false` here and goes on to the sessions and the tokens.
	 * This deletes the record only — those two are other stores', and the core
	 * deletes them next.
	 */
	deleteUser(id: Id): Promise<boolean>;
}

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

/**
 * What a one-time token is for. A token redeemed for another purpose is
 * unknown.
 *
 * - `verifyEmail`, `resetPassword`: a link sent by e-mail.
 * - `secondFactor`: the challenge a sign-in answers when the user has a second
 *   factor, redeemed with a code from their app.
 * - `signInCode`: a code sent by e-mail to sign in without a password.
 */
export type TokenKind =
	| 'verifyEmail'
	| 'resetPassword'
	| 'secondFactor'
	| 'signInCode';

/** A one-time token, as a store holds it: its hash, never its secret. */
export interface TokenRecord {
	/** `sha256` of the token's secret, hex. Unique across the store. */
	readonly tokenHash: string;
	readonly kind: TokenKind;
	readonly userId: Id;
	/** The e-mail the token was sent to — the one a verification marks verified. */
	readonly address: string;
	/**
	 * For a token redeemed with a code — `signInCode` — the code's hash, keyed
	 * by the token's secret, so the tokens alone do not reveal it. `null` for
	 * every other kind: the core writes it so, and a store keeps what it is
	 * given.
	 */
	readonly codeHash: string | null;
	/**
	 * How many codes were tried against it: `0` at insertion, and one more on
	 * every {@link TokenStore.countAttempt}. What bounds guessing a six-digit
	 * code.
	 */
	readonly attempts: number;
	readonly expiresAt: Date;
	/** `null` until spent. Once set, never changes. */
	readonly spentAt: Date | null;
	readonly createdAt: Date;
}

/** One-time tokens. Ephemeral by construction. */
export interface TokenStore {
	/**
	 * Stores a new token. Idempotent under retry: when a token with this hash
	 * exists, it writes nothing.
	 */
	insertToken(record: TokenRecord): Promise<void>;

	/**
	 * **The most important method on this port.** Spends the token and answers
	 * it **as it was before this call**.
	 *
	 * - `spentAt: null` in the answer means *this call* spent it. Exactly one
	 *   call ever sees that.
	 * - `spentAt` set means it was already spent, and nothing was written.
	 * - `null` means no token of this `kind` has this hash — including one the
	 *   store has already dropped. A token of the other kind is not touched.
	 *
	 * **One conditional write, never a read followed by a write.** A reset token
	 * two concurrent requests both redeem is an account takeover: twenty
	 * concurrent calls must produce exactly one answer with `spentAt: null`, and
	 * the conformance suite runs exactly that. In MongoDB this is one
	 * `findOneAndUpdate` returning the document *before* the update.
	 *
	 * A lapsed token is spent all the same. Comparing `expiresAt` is the core's
	 * job, after the call, so a lapsed token can never be retried.
	 */
	consumeToken(
		tokenHash: string,
		kind: TokenKind,
		at: Date,
	): Promise<TokenRecord | null>;

	/**
	 * Counts one attempt at a code against a token, and answers the token **as
	 * it is after this call**.
	 *
	 * - An **unspent** token of this `kind` has `attempts` one higher, and is
	 *   answered with it. Twenty concurrent calls answer twenty distinct
	 *   counts: one conditional write, never a read followed by a write — a
	 *   count two guesses both read is a guess for free.
	 * - A **spent** token is answered as it is, and nothing is written.
	 * - `null` means no token of this `kind` has this hash.
	 *
	 * A **lapsed** token is counted all the same, or answered `null` by a store
	 * that already dropped it — as for `consumeToken`, comparing `expiresAt` is
	 * the core's job, after the call.
	 *
	 * Whether the count is past the limit, and whether the code matches, is the
	 * core's decision, after the call; spending the token is `consumeToken`.
	 */
	countAttempt(tokenHash: string, kind: TokenKind): Promise<TokenRecord | null>;

	/**
	 * Deletes every token of one user, spent or not, and answers how many.
	 * What deleting a user calls: a token holds the e-mail it was sent to, which
	 * must not outlive the user until its expiry.
	 */
	deleteUserTokens(userId: Id): Promise<number>;
}

/**
 * The three stores `janus()` takes.
 *
 * Each slot may come from a different adapter. That is the point of the seam:
 * `@nxgt/janus-redis` can serve `sessions` and `tokens` while
 * `@nxgt/janus-mongo` serves `users`.
 */
export interface JanusStores {
	readonly users: UserStore;
	readonly sessions: SessionStore;
	readonly tokens: TokenStore;
}

/** What `assertStores` found beyond the required methods. */
export interface StoreCapabilities {
	/** Whether `sessions.deleteExpiredSessions` is implemented. */
	readonly collectExpired: boolean;
}
