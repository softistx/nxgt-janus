/**
 * The flows every user type has, whatever its configuration: creating,
 * reading, listing, updating, deactivating and deleting its users.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { CursorPage } from '../../pagination/cursor-page';
import type { UserRef, WriteOptions } from './user';

/** What every user type answers. */
export interface UserTypeApi<U, In> {
	/**
	 * Creates a user without signing them in — for an import, an admin screen,
	 * an invitation. Validates the fields, and hashes the password when one is
	 * given.
	 *
	 * Rejects with `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN`, or
	 * `STORE_FAILED`.
	 */
	create(
		input: In & { readonly password?: string; readonly active?: boolean },
	): Promise<U>;

	/** The user of this type, or `null` — for a malformed id, an unknown one, or one of another type. */
	find(id: string): Promise<U | null>;

	/**
	 * The users of this type holding these ids, **in the order the ids were
	 * given** — one query when the users store implements `findUsers`, a few
	 * `find`s at a time when it does not. For a list of rows, where one `find`
	 * per row would fill the connection pool.
	 *
	 * An id `find` answers `null` for — malformed, unknown, or another type's —
	 * is **left out**, so the answer may be shorter than `ids`: match by
	 * `user.id`, never by position. A repeated id is answered once, at its
	 * first place. An empty list answers `[]` without reaching the store. Any
	 * length is read, 100 ids per query.
	 *
	 * Rejects with `STORE_FAILED` only: an absence is never an error here.
	 */
	findMany(ids: readonly string[]): Promise<U[]>;

	/** The user of this type, or `NOT_FOUND`. */
	get(id: string): Promise<U>;

	/** One page of users of this type, in creation order. A cursor this package did not mint is `INVALID_CURSOR`. */
	list(page?: {
		readonly after?: string | null;
		readonly limit?: number;
	}): Promise<CursorPage<U>>;

	/**
	 * Changes some fields and keeps the others: the patch is merged over the
	 * stored fields, then **the whole result is validated**. Changing the e-mail
	 * sets `emailVerified` back to `false`.
	 */
	update(user: UserRef, patch: Partial<In>, options?: WriteOptions): Promise<U>;

	/** Activates or deactivates. An inactive user's sessions stop authenticating. */
	setActive(user: UserRef, active: boolean, options?: WriteOptions): Promise<U>;

	/**
	 * Deletes the user, **with every session and one-time token they had** —
	 * nothing of theirs is kept, the e-mail a token was sent to included.
	 * `true` when this call deleted them; `false` for a malformed id, an
	 * unknown one, or one of another type, which is left untouched.
	 *
	 * With `relations` wired into `janus()`, every tuple naming the user goes
	 * too, last.
	 *
	 * Idempotent: an outage half-way leaves sessions, tokens and tuples that
	 * name somebody who no longer exists, and calling it again deletes them.
	 */
	delete(user: UserRef): Promise<boolean>;
}
