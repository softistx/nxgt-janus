import { InvalidCursorError } from '../errors/janus-error';

/**
 * One page of results, and where the next one starts.
 *
 * `nextCursor` is `null` on the last page and a string on every other, so
 * `while (cursor)` is the loop and there is no separate "done" flag to forget.
 *
 * **There is no `total`**, and that is deliberate — the same choice
 * `@nxgt/mongo`'s cursor page makes, for the same reason: an exact count over a
 * large table is a second scan, and no adapter should be made to promise one.
 * An application that needs a count asks its own store for one, where it can
 * decide what the count is allowed to cost.
 *
 * This type is **redefined here rather than imported** from `@nxgt/mongo`. That
 * is deliberate duplication, recorded in AGENTS.md: a port that every adapter
 * implements cannot make one database library a dependency of the contract.
 */
export interface CursorPage<T> {
	readonly items: readonly T[];
	readonly nextCursor: string | null;
}

/** How many a page holds when the caller did not say. */
export const DEFAULT_PAGE_SIZE = 20;

/**
 * The most a page may hold, whatever the caller asked for.
 *
 * Bounded in the core rather than left to each adapter, so a caller cannot ask
 * one store for a million rows and be refused by another. An application that
 * wants everything pages for it.
 */
export const MAX_PAGE_SIZE = 100;

/**
 * The limit a store will be given, from the limit a caller asked for.
 *
 * `where` names the call the consumer wrote — `listIdentities`, not an internal
 * function — because several calls in this package take a `limit` and a message
 * that does not say which one leaves the reader to guess. That naming rule is
 * `nxgt-data`'s, and it is the reason its errors read the way they do.
 *
 * A bare `TypeError`: a limit is written in the application's own code, so this
 * cannot come from a request.
 */
export function pageLimit(limit: number | undefined, where: string): number {
	if (limit === undefined) return DEFAULT_PAGE_SIZE;

	if (!Number.isInteger(limit) || limit < 1) {
		throw new TypeError(
			`${where}: limit must be an integer of at least 1, or absent`,
		);
	}

	return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * Refuses a cursor this store did not mint.
 *
 * Exported for adapter authors: a cursor from another store, another ordering
 * or another version of the adapter must be refused, **never treated as an
 * absent cursor**. A silent fall back to the first page makes a caller paging a
 * list loop for ever, and the loop looks like a slow query rather than a bug.
 */
export function invalidCursor(
	where: string,
	cursor: string,
): InvalidCursorError {
	// The cursor's own bytes are not in the message: it is opaque, it may be
	// long, and printing it tells the reader nothing they can act on. Its length
	// is enough to tell "truncated in transit" from "written by another store".
	return new InvalidCursorError(
		`${where}: this cursor was not minted by this store, or was minted for another ordering (${cursor.length} characters)`,
	);
}
