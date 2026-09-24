import { describe, expect, it } from 'bun:test';
import { createMemoryRelations } from '../permissions/port/memory';
import {
	allRelationCases,
	describeRelationStores,
	referenceRelationHarness,
	runRelationCase,
} from './relations';

// The suite proved against the reference store, outages included, before any
// adapter runs it.
describeRelationStores({
	name: 'the reference relation store',
	harness: referenceRelationHarness(),
	runner: { describe, it },
});

describe('the relation suite itself', () => {
	it('covers every method of the port with an outage case', () => {
		expect(
			allRelationCases.filter((c) => c.group === 'outage').map((c) => c.id),
		).toEqual([
			'outage.write',
			'outage.has',
			'outage.findSubjectSets',
			'outage.findEntities',
			'outage.findObjects',
			'outage.deleteEntity',
		]);
	});

	it('gives every case a unique id', () => {
		const ids = allRelationCases.map((c) => c.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('reports a run without faults, never passes over it', async () => {
		const outage = allRelationCases.find((c) => c.id === 'outage.has');
		if (outage === undefined) throw new Error('no outage.has case');

		expect(
			await runRelationCase(outage, {
				open: async () => ({ store: createMemoryRelations() }),
			}),
		).toEqual({ skipped: expect.stringContaining('faults not provided') });
	});
});
