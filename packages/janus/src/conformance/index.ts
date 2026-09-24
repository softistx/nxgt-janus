/**
 * `@nxgt/janus/conformance` — **what makes the port's contract checkable.**
 *
 * An adapter author runs this against their stores, and it fails an adapter
 * that breaks one of the port's six rules — above all the one this package is
 * built around: *an absence is `null`, a failure throws*. In an HTTP SDK that
 * rule lives in one unwrapping function; in an embedded core it lives in the
 * contract of the port, and this is where the contract is checked. That is why
 * it is a published entry point, and not a page of documentation.
 *
 * Three layers, and the lowest depends on no test runner:
 *
 * - the cases, as data — `userStoreCases`, `sessionStoreCases`,
 *   `tokenStoreCases`, `outageCases`, `allCases`;
 * - `runCase`, which runs one against a harness;
 * - `describeJanusStores`, which describes them all under bun:test, vitest
 *   or jest.
 *
 * The same three for a relation store, the port `@nxgt/janus/permissions`
 * reads: `relationStoreCases`, `relationOutageCases`, `allRelationCases`;
 * `runRelationCase`; `describeRelationStores`.
 *
 * It imports no test framework and no assertion library.
 */

export { outageCases } from './cases/outage';
export { sessionStoreCases } from './cases/sessions';
export { tokenStoreCases } from './cases/tokens';
export { userStoreCases } from './cases/users';
export {
	allCases,
	describeJanusStores,
	runCase,
	SKIP_REASONS,
} from './describe';
export { referenceHarness } from './reference';
export {
	allRelationCases,
	describeRelationStores,
	type OpenedRelations,
	type RelationCase,
	type RelationContext,
	type RelationFaults,
	type RelationHarness,
	type RelationMethod,
	referenceRelationHarness,
	relationOutageCases,
	relationStoreCases,
	runRelationCase,
} from './relations';
export type {
	CaseContext,
	ConformanceCase,
	ConformanceHarness,
	ConformanceRunner,
	OpenedStores,
	PortMethod,
	StoreFaults,
} from './types';
