import { equal } from '../../assert';
import { entity, set, tuple } from '../fixtures';
import type { RelationCase } from '../types';

const group = 'relations';

/** What deleting an entity removes, and what it leaves. */
export const relationDeletionCases: readonly RelationCase[] = [
	{
		id: 'relations.deleteEntity',
		group,
		name: 'deletes every tuple naming an entity — as object, as subject, as a set’s entity — and counts them',
		async run({ store }) {
			const team = entity('team');
			const other = entity('team');
			const kept = [
				tuple(other, 'member', entity('staff')),
				tuple(entity('record'), 'viewer', set('team', other.id, 'member')),
			];
			await store.write({
				add: [
					tuple(team, 'member', entity('staff')),
					tuple(entity('record'), 'team', team),
					tuple(entity('record'), 'viewer', set('team', team.id, 'member')),
					...kept,
				],
			});

			equal(
				await store.deleteEntity(team),
				3,
				'deleteEntity: how many it deleted',
			);
			for (const survivor of kept) {
				equal(
					await store.has(survivor),
					true,
					'deleteEntity should not touch another entity',
				);
			}
			equal(
				await store.deleteEntity(team),
				0,
				'deleteEntity replayed answers 0, not a failure',
			);
		},
	},
];
