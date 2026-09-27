/**
 * The conformance suite of the relation store port — what an adapter author
 * runs against `RelationStore`, as `describeJanusStores` is run against the
 * user port.
 *
 * ```ts
 * import { describe, it } from 'bun:test';
 * import { describeRelationStores } from '@nxgt/janus/conformance';
 *
 * describeRelationStores({ name: 'my adapter', harness, runner: { describe, it } });
 * ```
 */

export { relationStoreCases } from './cases';
export { relationOutageCases } from './cases/outage';
export {
	allRelationCases,
	describeRelationStores,
	runRelationCase,
} from './describe';
export { referenceRelationHarness } from './reference';
export type {
	OpenedRelations,
	RelationCase,
	RelationContext,
	RelationFaults,
	RelationHarness,
	RelationMethod,
} from './types';
