/**
 * **The identity side's two conversions**, and the one place a `null` becomes
 * an error.
 *
 * > An absence is `null`. A failure throws.
 *
 * {@link guardStores} puts the three identity stores behind the shared guard
 * (`src/stores/guard.ts`), the one place a store's answer is caught.
 * {@link required} turns an absence the caller cannot accept into its refusal,
 * and {@link unlessVersionConflict} absorbs one named conflict and rethrows
 * everything else.
 *
 * `outage.spec.ts` reads every other file of `src/auth/`, `src/permissions/`
 * and `src/stores/` and fails if a `catch` appears in one, because the failure
 * this design exists to prevent is a single careless `catch { return null }`.
 */

import { type JanusError, StoreConflict } from '../errors/janus-error';
import { guardStore } from '../stores/guard';
import type { JanusStores } from './port/types';

/**
 * The stores, with every method guarded.
 *
 * - A `JanusError` the adapter threw — `StoreFailure`, `StoreConflict`,
 *   `NotFoundError` — passes through untouched, so `instanceof` still holds.
 * - **Anything else it threw is a failure**: a driver error, a `TypeError` from
 *   a bug in the adapter, a string. It becomes `StoreFailure` with the original
 *   as `cause`, naming the slot and the method. It is never an absence.
 * - A method that answers `undefined` where the port says `null` is a store
 *   that forgot to answer, and becomes `StoreFailure` rather than "not found".
 *   Rule 2 of the port, enforced at run time for the JavaScript adapter the
 *   compiler never saw.
 *
 * The optional `deleteExpiredSessions` is guarded when present and left absent
 * when absent, so capability detection still reads the truth.
 */
export function guardStores(stores: JanusStores): JanusStores {
	return {
		users: guardStore('users', stores.users),
		sessions: guardStore('sessions', stores.sessions),
		tokens: guardStore('tokens', stores.tokens),
	};
}

/**
 * A value the caller requires, or the refusal an absence deserves.
 *
 * The only place in the core where a `null` from a store turns into an error —
 * `get` becoming `NOT_FOUND`. Written as a function so that the conversion is
 * visible at every call site and nowhere else.
 */
export function required<T>(value: T | null, absent: () => JanusError): T {
	if (value === null) throw absent();
	return value;
}

/**
 * A write that may lose a race, and is allowed to: its answer, or `null` when
 * the record's version moved under it.
 *
 * **Only `StoreConflict('version')` is absorbed.** A failure still throws, a
 * taken login still throws, `NOT_FOUND` still throws: an outage never reads as
 * "somebody else wrote first". It exists for writes the caller did not ask for
 * — rewriting a password hash on sign-in — where losing to a concurrent update
 * means only that the next sign-in tries again.
 */
export async function unlessVersionConflict<T>(
	write: Promise<T>,
): Promise<T | null> {
	try {
		return await write;
	} catch (error) {
		if (error instanceof StoreConflict && error.on === 'version') return null;
		throw error;
	}
}
