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
 *    user — but the port exposes none. And **a read sees every write that
 *    completed before it**: never a secondary or a read replica. A sign-in
 *    that re-reads the user after answering, and a new code spending the
 *    ones issued before it, both count on it — the one promise here no suite
 *    can check.
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

// Brought into scope for the `{@link JsonObject}` above; re-exported below.
import type { JsonObject } from './json';

export type { PasswordRecord, SecondFactorRecord } from './credentials';
export type { Json } from './json';
export type { SessionId, SessionRecord, SessionStore } from './sessions';
export type { JanusStores, StoreCapabilities } from './stores';
export type { TokenKind, TokenRecord, TokenStore } from './tokens';
export type {
	UserPageRequest,
	UserPatch,
	UserRecord,
	UserStore,
} from './users';
export type { JsonObject };
