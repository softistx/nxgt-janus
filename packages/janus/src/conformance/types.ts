import type { IdentityStores } from '../identities/port/types';

/** A port method of one slot, by name. */
export type PortMethod<S extends keyof IdentityStores> =
	keyof IdentityStores[S] & string;

/**
 * How the suite makes a store fail **the way its database fails**.
 *
 * Optional, and **its absence is reported, never passed over**: without it the
 * outage cases are recorded as skipped, with the reason *"faults not provided:
 * the outage invariant is not proven for this adapter"*. That is the one thing a
 * conformance suite for this port must not let an adapter stay silent about.
 *
 * For MongoDB it is the `failCommand` failpoint of the test mongod. Code 91
 * (`ShutdownInProgress`) is the right one — measured in nxgt-data, it makes the
 * driver forget the server. Codes 2, 9, 14 and 40647 are the caller's input and
 * are not retried, so they cannot stand in for a transient outage.
 */
export interface StoreFaults {
	/**
	 * From now until these stores are closed, every call to `method` fails as the
	 * database would fail: a refused connection, a stepped-down primary, a
	 * timeout. **Not** a decorator that throws in front of the adapter — that
	 * would prove the decorator, and not the adapter's translation.
	 */
	fail<S extends keyof IdentityStores>(
		slot: S,
		method: PortMethod<S>,
	): Promise<void>;
}

/** One set of stores, opened for one case. */
export interface OpenedStores {
	readonly stores: IdentityStores;
	readonly faults?: StoreFaults;
	/** Called after the case, pass or fail. */
	close?(): Promise<void>;
}

/**
 * Opens a **fresh, empty** set of stores — once per case, not once per file. A
 * case that leaks its state into the next is the hardest conformance failure
 * to debug, so the suite never lets two cases share stores.
 */
export interface ConformanceHarness {
	open(): Promise<OpenedStores>;
}

/** What a case runs against. */
export interface CaseContext {
	readonly stores: IdentityStores;
	readonly faults: StoreFaults | null;
}

/**
 * One conformance case, as **data**.
 *
 * The lowest layer depends on no test runner: `run` throws on failure and
 * resolves on success, so a case runs under `bun test`, vitest, jest, or a
 * plain loop.
 */
export interface ConformanceCase {
	/** Stable: `'identities.omission'`. What `skip` names. */
	readonly id: string;
	readonly group: 'identities' | 'sessions' | 'tokens' | 'outage';
	/** A sentence: what the store must do. */
	readonly name: string;
	/** What the case cannot run without; absent, the case is skipped with a reason. */
	readonly needs?: 'faults' | 'deleteExpiredSessions';
	run(context: CaseContext): Promise<void>;
}

/** The subset of a test runner the suite uses: bun:test, vitest and jest all have it. */
export interface ConformanceRunner {
	describe(name: string, body: () => void): void;
	it: {
		(name: string, body: () => Promise<void>): void;
		skip(name: string, body: () => Promise<void>): void;
	};
}
