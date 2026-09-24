/**
 * **The one place a store's answer is caught**, shared by both sides of the
 * package: the identity stores and the relation store reach a caller only
 * through {@link guardStore}.
 *
 * - A `JanusError` the store threw passes through, so `instanceof` holds.
 * - **Anything else it threw is a failure** — `StoreFailure`, naming the slot
 *   and the method, with the original as `cause`. Never an absence.
 * - `undefined` where the port says `null` is a store that forgot to answer,
 *   and becomes `StoreFailure` rather than "not found".
 *
 * The `catch` below always rethrows; `src/auth/outage.spec.ts` holds it to that.
 */

import {
	type JanusError,
	JanusError as JanusErrorClass,
	StoreFailure,
} from '../errors/janus-error';
import type { RelationStore } from '../permissions/port/types';

/** A store the guard names in a `StoreFailure`: `users`, `sessions`, `tokens` or `relations`. */
export type StoreSlot = NonNullable<StoreFailure['slot']>;

/**
 * The methods whose answer is legitimately nothing: `undefined` from them is
 * not a forgotten `return`. Every other method answers a value, `null`,
 * `false`, `0` or a page — **never `undefined`**.
 */
const ANSWERS_NOTHING = new Set(['insertSession', 'insertToken', 'write']);

export function guardStore<S extends object>(slot: StoreSlot, store: S): S {
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

function asFailure(
	error: unknown,
	slot: StoreSlot,
	method: string,
): JanusError {
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
 * The relation store, guarded the same way: the permission engine's only way
 * to a store, so a failure there is `STORE_FAILED` and never a denial.
 */
export function guardRelations(store: RelationStore): RelationStore {
	return guardStore('relations', store);
}
