import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { offShift, record, setup, staff, team } from './engine.fixtures';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

describe('an outage is never a denial', () => {
	for (const method of ['has', 'findSubjectSets', 'findEntities'] as const) {
		it(`rejects STORE_FAILED when ${method} cannot answer`, async () => {
			const inner = createMemoryRelations();
			const store: RelationStore = {
				...inner,
				[method]: async () => {
					throw new Error('primary stepped down');
				},
			};
			const access = setup(store);
			const t = team();
			const doc = record();
			await access.grant(doc, 'viewers', {
				type: 'team',
				id: t.id,
				relation: 'members',
			});
			await access.grant(doc, 'teams', t);

			const error = (await rejection(
				access.can(staff(), 'view', doc, offShift),
			)) as {
				code: string;
			};

			expect(error.code).toBe('STORE_FAILED');
		});
	}

	it('rejects a grant the store could not write', async () => {
		const access = setup({
			...createMemoryRelations(),
			write: async () => {
				throw new Error('primary stepped down');
			},
		});

		const error = (await rejection(
			access.grant(team(), 'members', staff()),
		)) as {
			code: string;
		};
		expect(error.code).toBe('STORE_FAILED');
	});
});
