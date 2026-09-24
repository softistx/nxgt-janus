import { StoreFailure } from '../errors/janus-error';
import { createMemoryStores } from '../identities/port/memory';
import type { IdentityStores } from '../identities/port/types';
import type { ConformanceHarness, StoreFaults } from './types';

/**
 * The harness for the reference store: what `self.spec.ts` runs the suite
 * against, and **the example an adapter author copies**.
 *
 * Its faults are a wrapper, because an in-memory map has no network to cut —
 * which is exactly why the doc on `StoreFaults` says an adapter must not do
 * this: a wrapper proves the wrapper. For the reference store there is nothing
 * underneath to prove, and it fails the way a correct adapter does, with
 * `StoreFailure`.
 */
export function referenceHarness(): ConformanceHarness {
	return {
		async open() {
			const failing = new Set<string>();
			const stores = withFaults(createMemoryStores(), failing);

			const faults: StoreFaults = {
				async fail(slot, method) {
					failing.add(`${slot}.${method}`);
				},
			};

			return { stores, faults };
		},
	};
}

function withFaults(
	stores: IdentityStores,
	failing: ReadonlySet<string>,
): IdentityStores {
	const wrap = <S extends object>(slot: string, store: S): S => {
		const wrapped: Record<string, unknown> = {};
		for (const [method, fn] of Object.entries(store)) {
			wrapped[method] = (...args: unknown[]) => {
				if (failing.has(`${slot}.${method}`)) {
					return Promise.reject(
						new StoreFailure(`${slot}.${method}: the store could not answer`, {
							slot: slot as keyof IdentityStores,
							operation: method,
						}),
					);
				}
				return (fn as (...a: unknown[]) => unknown).apply(store, args);
			};
		}
		return wrapped as S;
	};

	return {
		identities: wrap('identities', stores.identities),
		sessions: wrap('sessions', stores.sessions),
		tokens: wrap('tokens', stores.tokens),
	};
}
