import { describeSuite, fromGlobals, SKIP_REASONS } from '../describe';
import type { ConformanceRunner } from '../types';
import { relationStoreCases } from './cases';
import { relationOutageCases } from './cases/outage';
import type { RelationCase, RelationHarness } from './types';

/** Every case, in the order they are described. */
export const allRelationCases: readonly RelationCase[] = [
	...relationStoreCases,
	...relationOutageCases,
];

/** Runs one case against a freshly opened store, and closes it, pass or fail. */
export async function runRelationCase(
	relationCase: RelationCase,
	harness: RelationHarness,
): Promise<{ readonly skipped: string } | { readonly passed: true }> {
	const opened = await harness.open();

	try {
		if (relationCase.needs === 'faults' && opened.faults === undefined) {
			return { skipped: SKIP_REASONS.faults };
		}
		await relationCase.run({
			store: opened.store,
			faults: opened.faults ?? null,
		});
		return { passed: true };
	} finally {
		await opened.close?.();
	}
}

/** Describes the whole relation suite under the adapter's test runner. */
export function describeRelationStores(options: {
	readonly name: string;
	readonly harness: RelationHarness;
	readonly runner?: ConformanceRunner;
	/** Case ids to skip, each with the reason — reported, never silent. */
	readonly skip?: Readonly<Record<string, string>>;
	readonly faults?: boolean;
}): void {
	describeSuite({
		title: `${options.name} — @nxgt/janus relation conformance`,
		cases: allRelationCases,
		run: (relationCase) => runRelationCase(relationCase, options.harness),
		runner: options.runner ?? fromGlobals('describeRelationStores'),
		skip: options.skip ?? {},
		faults: options.faults,
	});
}
