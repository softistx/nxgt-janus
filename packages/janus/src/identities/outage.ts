/**
 * **The one place a store call is caught, and the one place a `null` becomes an
 * error.**
 *
 * The transposition of `call.ts` in `nxgt-ory`'s SDK — "the only place a call
 * is unwrapped" — into a core with no status codes. The invariant this whole
 * package is built around is checked by reading this file:
 *
 * > An absence is `null`. A failure throws.
 *
 * `outage.spec.ts` reads every other file of `src/identities/` and fails if a
 * `catch` appears in one, because the failure this design exists to prevent is
 * a single careless `catch { return null }`. The `catch` below always rethrows.
 */

import {
	type JanusError,
	JanusError as JanusErrorClass,
	StoreFailure,
} from '../errors/janus-error';
import type { IdentityStores } from './port/types';

type Slot = keyof IdentityStores;

/**
 * The methods whose answer is legitimately nothing: `undefined` from them is
 * not a forgotten `return`. Every other method answers a value, `null`,
 * `false`, `0` or a page — **never `undefined`**.
 */
const ANSWERS_NOTHING = new Set(['insertSession', 'insertToken']);

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
export function guardStores(stores: IdentityStores): IdentityStores {
	return {
		identities: guardSlot('identities', stores.identities),
		sessions: guardSlot('sessions', stores.sessions),
		tokens: guardSlot('tokens', stores.tokens),
	};
}

function guardSlot<S extends object>(slot: Slot, store: S): S {
	const guarded: Record<string, unknown> = {};

	for (const method of methodsOf(store)) {
		const original = (store as Record<string, unknown>)[method];
		if (typeof original !== 'function') continue;

		guarded[method] = async (...args: unknown[]) => {
			let answer: unknown;

			try {
				answer = await original.apply(store, args);
			} catch (error) {
				// Rethrown, always. The only question is under which class.
				throw asFailure(error, slot, method);
			}

			if (answer === undefined && !ANSWERS_NOTHING.has(method)) {
				throw new StoreFailure(
					`${slot}.${method} answered undefined: an absence is null, so this store forgot to answer`,
					{ slot, operation: method },
				);
			}

			return answer;
		};
	}

	return guarded as S;
}

/** Own and prototype methods, so a class-based store is guarded like a literal. */
function methodsOf(store: object): string[] {
	const names = new Set<string>();

	for (
		let proto: object | null = store;
		proto !== null && proto !== Object.prototype;
		proto = Object.getPrototypeOf(proto)
	) {
		for (const name of Object.getOwnPropertyNames(proto)) {
			if (name !== 'constructor') names.add(name);
		}
	}

	return [...names];
}

function asFailure(error: unknown, slot: Slot, method: string): JanusError {
	if (error instanceof JanusErrorClass) return error;

	// The message names where, never what: a driver's message may hold a
	// connection string, and a connection string holds a password. It is kept
	// as `cause`, for the operator's logs.
	return new StoreFailure(`${slot}.${method}: the store could not answer`, {
		slot,
		operation: method,
		cause: error,
	});
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
