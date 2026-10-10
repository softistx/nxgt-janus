/**
 * The users store: a user's record, what one update changes, and the port a
 * store implements for them.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./index`.
 */

import type { Id } from '../../../ids/id';
import type { CursorPage } from '../../../pagination/cursor-page';
import type { PasswordRecord, SecondFactorRecord } from './credentials';
import type { JsonObject } from './json';

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
	 * **Optional capability.** The users holding these ids, whatever their
	 * type, in **one query** — `@nxgt/janus-drizzle`'s `inArray`,
	 * `@nxgt/janus-mongo`'s `$in`.
	 *
	 * An id no user holds is **left out**: an absence here is a shorter list,
	 * never `null` and never a rejection. Each record appears once, in any
	 * order — the core puts them back in the caller's order. A failure throws,
	 * as everywhere on this port: answering `[]` for an outage turns it into
	 * "nobody", which is the lockout rule 2 exists to prevent.
	 *
	 * The core calls it with **1 to 100 distinct, well-formed ids**, never an
	 * empty list, and reads a longer list in several calls. A store that does
	 * not implement it is read with `findUser`, a few ids at a time, so every
	 * store answers `findMany`; this method only makes it one round trip.
	 */
	findUsers?(ids: readonly Id[]): Promise<readonly UserRecord[]>;

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
