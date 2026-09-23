/**
 * The identity store port: what an adapter implements, and nothing else.
 *
 * **This is the contract strangers are asked to implement**, so every line of
 * it is a promise. It is small on purpose — anything the core can derive from
 * what the port already offers (verifying an address, merging traits, deciding
 * that a session has lapsed) lives in the core, where it is written once,
 * rather than here, where every adapter would write it again, differently.
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
 *    "no such account", and every caller above it answers 404 to somebody
 *    whose account exists.
 * 2. **`null`, not `undefined`.** `undefined` is what a missing property and a
 *    function with no `return` both produce, so a store that forgot to answer
 *    would report "not found" by accident. `null` has to be written on purpose.
 * 3. **Uniqueness is yours, and it is a constraint.** A unique index, a
 *    constraint, an atomic `SET NX` — never a read followed by a write, which
 *    two concurrent sign-ups both pass.
 * 4. **Bytes round-trip.** Identifiers, hashes, traits and metadata come back
 *    exactly as they were written: no normalisation, no trimming, no `1` turned
 *    into `'1'`. The core normalises identifiers before a store ever sees them,
 *    so uniqueness is uniqueness of bytes and no adapter needs a collation.
 * 5. **Every method is atomic on its own.** Nothing composes into a
 *    transaction, and the core never opens one. An adapter may open one
 *    *inside* a method — a normalised SQL schema writes several rows per
 *    identity — but the port exposes none.
 * 6. **Schema management is not on this interface.** An adapter exposes its own
 *    `sync()`; the core never calls it.
 *
 * ## Why three stores and not one
 *
 * The seam is **where atomicity is not required**. An identity and its
 * credentials are written together — a sign-up that stores the identity and
 * loses the password hash is an account nobody can enter — so they are one
 * interface and one unit of atomicity. A session is derived state: losing them
 * all signs everybody out, which recovers. A one-time token is ephemeral by
 * construction. So `sessions` and `tokens` may live in Redis while `identities`
 * lives in MongoDB, in one call to `createIdentities`, with no distributed
 * transaction anywhere.
 *
 * ## Why the port is not generic
 *
 * A store does not know the traits schema, and must not have to: traits are a
 * {@link JsonObject} here, and the core casts once, at the boundary, after the
 * schema has validated them. That is the shape `nxgt-data` uses — a generic
 * public form, a degenericised mirror inside — and it keeps every adapter free
 * of type parameters it could only pass through.
 */

import type { IdentityId } from '../../ids/identity-id';
import type { CursorPage } from '../../pagination/cursor-page';

/**
 * A value a store must be able to round-trip byte for byte.
 *
 * JSON and nothing else. A `Date` inside traits round-trips through MongoDB and
 * not through a JSON column or Redis, so an adapter could pass the conformance
 * suite on one database and corrupt traits on the next. The record's own
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

/**
 * Whether an identity may sign in.
 *
 * `inactive` keeps the record and its credentials and refuses every sign-in.
 * There is no third state, and no deletion on this port yet.
 */
export type IdentityState = 'active' | 'inactive';

/**
 * The credential an identifier signs in with.
 *
 * `password` and `code` in v1. A code credential holds no secret — the code is
 * a one-time token sent to the identifier — so only `password` has a slot in
 * {@link IdentityCredentials}.
 */
export type CredentialType = 'password' | 'code';

/**
 * One way to name an identity at sign-in.
 *
 * **`value` is already normalised** by the core, as the definition's
 * `normalize` says. The store compares bytes and is never asked to lowercase,
 * trim or collate anything.
 *
 * The pair `(type, value)` is unique across every identity in the store, and
 * that uniqueness is a constraint the store enforces (rule 3).
 */
export interface IdentityIdentifier {
	readonly type: CredentialType;
	readonly value: string;
}

/** A password, as the store holds it: a self-describing hash, never the plain text. */
export interface PasswordCredential {
	/** Self-describing — `$argon2id$…`, `$scrypt$…` — so any wired verifier can read it. */
	readonly hash: string;
	readonly updatedAt: Date;
}

/**
 * The secrets an identity signs in with.
 *
 * Every slot is present and `null` when absent, never missing: rule 2, applied
 * to the one place a missing field would read as "no password" rather than as
 * "the store forgot".
 */
export interface IdentityCredentials {
	readonly password: PasswordCredential | null;
}

/** How a verifiable address is reached. Only e-mail in v1. */
export type AddressChannel = 'email';

/**
 * An address the identity can prove it controls.
 *
 * Addressed **by value** by the core, never by index. In Kratos, moving
 * `verified` is a patch on two fields at an index taken from the record just
 * read, and getting either wrong shows an address as verified in one place and
 * pending in another. Here `verified` and `verifiedAt` are one fact, set
 * together by the core, and written with the rest of `addresses`.
 */
export interface VerifiableAddress {
	readonly value: string;
	readonly via: AddressChannel;
	readonly verified: boolean;
	/** `null` until verified, and set in the same write that sets `verified`. */
	readonly verifiedAt: Date | null;
}

/**
 * An identity, as a store holds it.
 *
 * Everything is `readonly`: the core hands records to application code, and a
 * mutation would not reach the store — it could only mislead whoever wrote it.
 */
export interface IdentityRecord {
	/** A UUIDv7 minted by the core. The store never mints an id. */
	readonly id: IdentityId;
	/**
	 * Which version of the application's traits schema these traits were last
	 * validated against.
	 *
	 * **Nothing reads it yet**, and it is here from v1 on purpose. Tightening the
	 * schema changes what an update accepts, and every stored identity was
	 * validated against the old one: without this field there is no way to find
	 * the identities that are now unmodifiable. Adding a field to the port later
	 * breaks every adapter; adding it now costs one column.
	 */
	readonly schemaVersion: string;
	readonly state: IdentityState;
	readonly traits: JsonObject;
	readonly identifiers: readonly IdentityIdentifier[];
	readonly credentials: IdentityCredentials;
	readonly addresses: readonly VerifiableAddress[];
	/** Readable by the identity itself. `{}` when empty — never `null`, so there is one way to be empty. */
	readonly metadataPublic: JsonObject;
	/** Readable by the application only. `{}` when empty. */
	readonly metadataAdmin: JsonObject;
	/**
	 * `0` at insertion, and one more on every accepted write. What
	 * {@link IdentityStore.updateIdentity}'s `ifVersion` is compared against.
	 */
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/**
 * What one {@link IdentityStore.updateIdentity} changes.
 *
 * **A field the patch does not name is left as it is.** There is no full
 * replacement of a record anywhere on this port: in Kratos, an update that
 * omits `state` deactivates the account, and an edit form that omits a trait
 * deletes it. A conformance case carries that trap's name.
 *
 * A field the patch *does* name is replaced whole — `traits`, `addresses` and
 * `identifiers` included. A deep merge would make every adapter implement a
 * merge on nested arrays, differently on every database. The core computes the
 * next value from the record it just read, under `ifVersion`, so no write is
 * lost by it.
 *
 * `credentials` is the one field patched slot by slot: `{ password: null }`
 * removes the password, and a patch that does not name `password` keeps it.
 *
 * `id`, `version` and `createdAt` are not patchable: the first two are the
 * store's to keep, the last is history. `updatedAt` is **required**, and comes
 * from the core's clock rather than the database's, so every timestamp on a
 * record comes from one clock.
 *
 * A key present with the value `undefined` is absent. This package is compiled
 * with `exactOptionalPropertyTypes`, so the core cannot write one; an adapter
 * receiving one from JavaScript still treats it as absent, never as an erasure.
 */
export interface IdentityPatch {
	readonly updatedAt: Date;
	readonly schemaVersion?: string;
	readonly state?: IdentityState;
	readonly traits?: JsonObject;
	readonly identifiers?: readonly IdentityIdentifier[];
	readonly credentials?: { readonly password?: PasswordCredential | null };
	readonly addresses?: readonly VerifiableAddress[];
	readonly metadataPublic?: JsonObject;
	readonly metadataAdmin?: JsonObject;
}

/** Where a page of identities starts, and how much of it to read. */
export interface IdentityPageRequest {
	/**
	 * The last id of the previous page, or `null` for the first.
	 *
	 * Already checked by the core to be an id this package could have minted,
	 * so the store never parses a cursor. It need not name a stored identity:
	 * the page is every id strictly greater than it.
	 */
	readonly after: IdentityId | null;
	/** Already bounded by the core, between 1 and `MAX_PAGE_SIZE`. */
	readonly limit: number;
}

/**
 * Identities, their credentials and their identifiers: one unit of atomicity.
 */
export interface IdentityStore {
	/**
	 * Stores a new identity, verbatim, and answers what is stored.
	 *
	 * **Idempotent under retry.** When an identity with this `id` already
	 * exists, it answers the stored record and writes nothing — a retry after a
	 * timeout whose first attempt landed is a success, not a conflict. That
	 * includes the identifiers: an identifier held by the identity with this
	 * same `id` is not taken.
	 *
	 * An identifier held by **another** identity rejects with
	 * `StoreConflict('identifier', …)`, carrying `identifier` and
	 * `credentialType`, and writes nothing. That refusal comes from the store's
	 * own constraint, never from a read made first.
	 */
	insertIdentity(record: IdentityRecord): Promise<IdentityRecord>;

	/** The identity with this id, or `null`. */
	findIdentity(id: IdentityId): Promise<IdentityRecord | null>;

	/**
	 * The identity holding this identifier, or `null`.
	 *
	 * `value` is compared byte for byte: the core normalised it with the same
	 * rule it used when the identifier was written.
	 */
	findIdentityByIdentifier(
		type: CredentialType,
		value: string,
	): Promise<IdentityRecord | null>;

	/**
	 * One page of identities, in ascending id order — which is creation order.
	 *
	 * `nextCursor` is the last id of the page when more follow, and `null` on
	 * the last page. An empty store answers an empty page, never `null`.
	 */
	listIdentities(
		page: IdentityPageRequest,
	): Promise<CursorPage<IdentityRecord>>;

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
	 * - `NotFoundError` when no identity has this id. The one method on this
	 *   port that throws for an absence: it always follows a read, so an absence
	 *   here is a race, not an answer;
	 * - `StoreConflict('version', …)` with `expectedVersion` and
	 *   `actualVersion` when the version moved. A conditional write cannot tell
	 *   this from an absent id on its own, so the adapter reads again after a
	 *   write that matched nothing;
	 * - `StoreConflict('identifier', …)` when the patch's identifiers collide
	 *   with another identity's.
	 */
	updateIdentity(
		id: IdentityId,
		patch: IdentityPatch,
		ifVersion: number,
	): Promise<IdentityRecord>;
}

/** A session's id: a UUIDv7 minted by the core, as an identity's is. */
export type SessionId = string;

/** How strongly the session's holder proved who they are. */
export type AuthenticatorAssuranceLevel = 'aal1' | 'aal2';

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
	readonly identityId: IdentityId;
	readonly aal: AuthenticatorAssuranceLevel;
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
	 * Revokes every standing session of one identity, except `except` when
	 * given — "sign out everywhere else". Answers how many this call revoked;
	 * `0` is an answer, not a failure.
	 */
	revokeIdentitySessions(
		identityId: IdentityId,
		at: Date,
		except?: SessionId,
	): Promise<number>;

	/**
	 * **Optional capability.** Deletes every session whose `expiresAt` is at or
	 * before `before`, and answers how many.
	 *
	 * A store with its own expiry — a TTL index, a key TTL — does not implement
	 * it. The core reads its presence rather than assuming it, and
	 * `sessions.collectExpired()` throws `UNSUPPORTED`, naming this method and
	 * the `sessions` slot, when it is absent.
	 */
	deleteExpiredSessions?(before: Date): Promise<number>;
}

/** What a one-time token is for. A token redeemed for the other purpose is unknown. */
export type TokenKind = 'verification' | 'recovery';

/** A one-time token, as a store holds it: its hash, never its secret. */
export interface TokenRecord {
	/** `sha256` of the token's secret, hex. Unique across the store. */
	readonly tokenHash: string;
	readonly kind: TokenKind;
	readonly identityId: IdentityId;
	/** The address the token was sent to — the one a verification marks verified. */
	readonly address: string;
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
	 * **One conditional write, never a read followed by a write.** A recovery
	 * code two concurrent requests both redeem is an account takeover: twenty
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
}

/**
 * The three stores `createIdentities` takes.
 *
 * Each slot may come from a different adapter. That is the point of the seam:
 * `@nxgt/janus-redis` can serve `sessions` and `tokens` while
 * `@nxgt/janus-mongo` serves `identities`.
 */
export interface IdentityStores {
	readonly identities: IdentityStore;
	readonly sessions: SessionStore;
	readonly tokens: TokenStore;
}

/** What `assertStores` found beyond the required methods. */
export interface StoreCapabilities {
	/** Whether `sessions.deleteExpiredSessions` is implemented. */
	readonly collectExpired: boolean;
}
