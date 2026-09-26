/**
 * What every store can keep. PostgreSQL refuses `\u0000` in `text` and
 * `jsonb`, and a lone surrogate in `jsonb`; MongoDB and the memory store keep
 * both. The core refuses them before a store is asked, so a request that sends
 * one is answered the same way on every adapter — not `STORE_FAILED` on one of
 * them, a 503 for a database that is up.
 *
 * Shared by both sides of the package, like `guard.ts`: a string from a
 * request reaches the identity stores and the relation store alike.
 */

/** Whether every store can keep this string. */
export const isStorable = (value: string): boolean =>
	!value.includes('\u0000') && value.isWellFormed();

/** What an issue says about a string no store can keep. */
export const UNSTORABLE =
	'holds a NUL character or a lone surrogate, which no store can keep';
