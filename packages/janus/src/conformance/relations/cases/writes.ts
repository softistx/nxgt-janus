import { equal } from '../../assert';
import { entity, tuple } from '../fixtures';
import type { RelationCase } from '../types';

const group = 'relations';

/** What a write does twice, or at once: nothing under a retry, one tuple under a race. */
export const relationWriteCases: readonly RelationCase[] = [
	{
		id: 'relations.idempotentWrite',
		group,
		name: 'is idempotent under retry: adding a stored tuple and removing an absent one write nothing',
		async run({ store }) {
			const record = entity('record');
			const viewer = tuple(record, 'viewer', entity('team'));
			await store.write({ add: [viewer] });
			await store.write({ add: [viewer] });
			await store.write({ remove: [tuple(record, 'viewer', entity('team'))] });

			equal(
				(await store.findEntities(record, 'viewer')).length,
				1,
				'findEntities after the same tuple was added twice',
			);
		},
	},
	{
		id: 'relations.uniqueness',
		group,
		name: 'keeps one tuple when twenty concurrent writes add it: uniqueness is a constraint, not a read',
		async run({ store }) {
			const record = entity('record');
			const parent = entity('folder');
			await Promise.all(
				Array.from({ length: 20 }, () =>
					store.write({ add: [tuple(record, 'parent', parent)] }),
				),
			);

			equal(
				await store.findEntities(record, 'parent'),
				[parent],
				'findEntities after twenty concurrent adds of one tuple',
			);
		},
	},
	{
		id: 'relations.removeThenAdd',
		group,
		name: 'applies one write’s removals and additions together',
		async run({ store }) {
			const record = entity('record');
			const before = tuple(record, 'owner', entity('staff', 'a'));
			const after = tuple(record, 'owner', entity('staff', 'b'));
			await store.write({ add: [before] });

			await store.write({ remove: [before], add: [after] });

			equal(await store.has(before), false, 'the removed tuple');
			equal(await store.has(after), true, 'the added tuple');
		},
	},
];
