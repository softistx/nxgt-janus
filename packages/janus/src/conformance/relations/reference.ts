import { StoreFailure } from '../../errors/janus-error';
import { createMemoryRelations } from '../../permissions/port/memory';
import type { RelationStore } from '../../permissions/port/types';
import type { RelationHarness } from './types';

/** The reference store, with faults: what the suite proves itself against. */
export function referenceRelationHarness(): RelationHarness {
	return {
		async open() {
			const failing = new Set<string>();
			const inner = createMemoryRelations();
			const store = Object.fromEntries(
				Object.entries(inner).map(([method, fn]) => [
					method,
					(...args: unknown[]) =>
						failing.has(method)
							? Promise.reject(
									new StoreFailure(
										`relations.${method}: the store could not answer`,
										{
											slot: 'relations',
											operation: method,
										},
									),
								)
							: (fn as (...a: unknown[]) => unknown).apply(inner, args),
				]),
			) as unknown as RelationStore;

			return {
				store,
				faults: {
					async fail(method) {
						failing.add(method);
					},
				},
			};
		},
	};
}
