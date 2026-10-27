import { InvalidCursorError } from '../../../errors/janus-error';
import { holderCursor } from '../../../permissions/port/holders';
import type { RelationStore } from '../../../permissions/port/types';
import type { Entity } from '../../../subjects/subject';
import { equal, isOurs, rejects } from '../../assert';
import { entity, set, tuple } from '../fixtures';
import type { RelationCase } from '../types';

const group = 'relations';

type FindHolders = NonNullable<RelationStore['findHolders']>;

/**
 * `findHolders` is **optional on the port**: a store that does not have it is
 * served by the core, and these cases pass for it without asking anything.
 * A store that has it answers pages ordered by type then id, cut by a
 * case-insensitive literal `search` on the id, and refuses a foreign cursor.
 */
export const relationHolderCases: readonly RelationCase[] = [
	{
		id: 'relations.findHolders',
		group,
		name: 'findHolders pages the single entities of one object and relation in type then id order, with a cursor, and leaves out subject sets and other relations',
		async run({ store }) {
			if (store.findHolders === undefined) return;
			const findHolders: FindHolders = store.findHolders.bind(store);
			const record = entity('record', 'holders');
			const staff = ['b2', 'a1', 'c3'].map((id) => entity('staff', id));
			const other = entity('patient', 'a1');
			await store.write({
				add: [
					...staff.map((holder) => tuple(record, 'viewer', holder)),
					tuple(record, 'viewer', other),
					tuple(record, 'viewer', set('team', 't1', 'member')),
					tuple(record, 'owner', entity('staff', 'zz')),
					tuple(entity('record', 'else'), 'viewer', entity('staff', 'yy')),
				],
			});
			const read = (after: string | null, limit: number) =>
				findHolders({
					object: record,
					relation: 'viewer',
					after,
					limit,
					search: null,
				});

			const first = await read(null, 3);
			equal(
				first.items,
				[other, entity('staff', 'a1'), entity('staff', 'b2')],
				'findHolders: the first page, by type then id',
			);
			equal(
				first.nextCursor,
				holderCursor(entity('staff', 'b2')),
				'findHolders: nextCursor follows the last item',
			);
			equal(
				await read(first.nextCursor, 3),
				{ items: [entity('staff', 'c3')], nextCursor: null },
				'findHolders: the last page ends with a null nextCursor',
			);
			equal(
				await read(holderCursor(entity('staff', 'a1')), 1),
				{
					items: [entity('staff', 'b2')],
					nextCursor: holderCursor(entity('staff', 'b2')),
				},
				'findHolders: a cursor need not name a stored holder',
			);
		},
	},
	{
		id: 'relations.findHolders.search',
		group,
		name: 'findHolders search keeps the holders whose id contains the text, ignoring case, and takes % _ . and \\ literally',
		async run({ store }) {
			if (store.findHolders === undefined) return;
			const findHolders: FindHolders = store.findHolders.bind(store);
			const record = entity('record', 'search');
			const ids = ['Ana', 'banana', 'a.b', 'a_b', 'a%b', 'a\\b', 'axb', 'zed'];
			await store.write({
				add: ids.map((id) => tuple(record, 'viewer', entity('staff', id))),
			});
			const found = async (search: string): Promise<string[]> => {
				const all: Entity[] = [];
				let after: string | null = null;
				do {
					const page = await findHolders({
						object: record,
						relation: 'viewer',
						after,
						limit: 2,
						search,
					});
					all.push(...page.items);
					after = page.nextCursor;
				} while (after !== null);
				return all.map((holder) => holder.id).sort();
			};

			equal(await found('ANA'), ['Ana', 'banana'], 'findHolders: ignores case');
			equal(await found('a.b'), ['a.b'], 'findHolders: "." is not a wildcard');
			equal(await found('a_b'), ['a_b'], 'findHolders: "_" is not a wildcard');
			equal(await found('a%b'), ['a%b'], 'findHolders: "%" is not a wildcard');
			equal(await found('a\\b'), ['a\\b'], 'findHolders: "\\" is no escape');
			equal(
				await found('nobody'),
				[],
				'findHolders: no match is an empty page',
			);
		},
	},
	{
		id: 'relations.findHolders.cursor',
		group,
		name: 'findHolders refuses a cursor it did not mint with InvalidCursorError, never the first page',
		async run({ store }) {
			if (store.findHolders === undefined) return;
			const findHolders: FindHolders = store.findHolders.bind(store);
			const record = entity('record', 'cursor');
			await store.write({
				add: [tuple(record, 'viewer', entity('staff', 'u1'))],
			});
			const error = await rejects(
				findHolders({
					object: record,
					relation: 'viewer',
					after: 'not a cursor of this store',
					limit: 5,
					search: null,
				}),
				'findHolders should refuse a foreign cursor',
			);
			isOurs(error, InvalidCursorError, 'InvalidCursorError', 'findHolders');
		},
	},
];
