import { equal } from '../../assert';
import { entity, set, sorted, tuple } from '../fixtures';
import type { RelationCase } from '../types';

const group = 'relations';

/**
 * The two directions a check walks: one hop down from an object, and the
 * objects one subject holds a relation on, paged.
 */
export const relationTraversalCases: readonly RelationCase[] = [
	{
		id: 'relations.oneHop',
		group,
		name: 'answers one hop: the subject sets and the entities holding one relation on one object, and nothing else',
		async run({ store }) {
			const record = entity('record');
			const staff = entity('staff');
			const team = entity('team');
			const members = set('team', team.id, 'member');
			const leads = set('team', team.id, 'lead');
			await store.write({
				add: [
					tuple(record, 'viewer', staff),
					tuple(record, 'viewer', team),
					tuple(record, 'viewer', members),
					tuple(record, 'viewer', leads),
					// Another relation, and another object: neither is an answer.
					tuple(record, 'editor', set('team', team.id, 'admin')),
					tuple(entity('record'), 'viewer', set('team', 'other', 'member')),
				],
			});

			equal(
				sorted(await store.findSubjectSets(record, 'viewer')),
				sorted([members, leads]),
				'findSubjectSets: the sets only, of this object and this relation',
			);
			equal(
				sorted(await store.findEntities(record, 'viewer')),
				sorted([staff, team]),
				'findEntities: the single entities only, of this object and this relation',
			);
		},
	},
	{
		id: 'relations.objects',
		group,
		name: 'pages 25 objects by 10 in ascending id order, for one type, relation and exact subject, and ends on a null cursor',
		async run({ store }) {
			const staff = entity('staff');
			const ids = Array.from(
				{ length: 25 },
				(_, n) => `r${String(n).padStart(2, '0')}`,
			);
			// Written newest first, beside noise the answer must leave out.
			for (const id of [...ids].reverse()) {
				await store.write({
					add: [
						tuple(entity('record', id), 'viewer', staff),
						tuple(entity('record', `${id}x`), 'editor', staff),
						tuple(entity('folder', id), 'viewer', staff),
						tuple(
							entity('record', `${id}y`),
							'viewer',
							set('staff', staff.id, 'x'),
						),
					],
				});
			}

			const seen: string[] = [];
			const sizes: number[] = [];
			let after: string | null = null;
			for (let page = 0; page < 10; page += 1) {
				const answer = await store.findObjects({
					type: 'record',
					relation: 'viewer',
					subject: staff,
					after,
					limit: 10,
				});
				seen.push(...answer.items);
				sizes.push(answer.items.length);
				after = answer.nextCursor;
				if (after === null) break;
			}

			equal(sizes, [10, 10, 5], 'findObjects: page sizes for 25 objects by 10');
			equal(seen, ids, 'findObjects: every id once, in ascending order');
			const between = await store.findObjects({
				type: 'record',
				relation: 'viewer',
				subject: staff,
				after: 'r04a',
				limit: 2,
			});
			equal(
				between.items,
				['r05', 'r06'],
				'findObjects: a cursor naming no stored object should start after it',
			);
		},
	},
];
