import type { Subject } from '../../../subjects/subject';
import { equal } from '../../assert';
import { entity, set, tuple } from '../fixtures';
import type { RelationCase } from '../types';

const group = 'relations';

/**
 * What a read answers: the tuples exactly as written — a subject's type, a
 * set's relation and every character of an id are part of it — and `false`,
 * `[]`, an empty page or `0` for an absence.
 */
export const relationReadCases: readonly RelationCase[] = [
	{
		id: 'relations.roundTrip',
		group,
		name: 'holds exactly the tuples written, byte for byte: staff:u1 is not patient:u1, and a set is not its entity',
		async run({ store }) {
			const record = entity('record', 'Ｒ:1 — ÿ');
			const direct = tuple(record, 'viewer', entity('staff', 'u1'));
			const inherited = tuple(record, 'viewer', set('team', 't1', 'member'));
			await store.write({ add: [direct, inherited] });

			equal(await store.has(direct), true, 'has for a written tuple');
			equal(await store.has(inherited), true, 'has for a written subject set');
			equal(
				await store.has(tuple(record, 'viewer', entity('patient', 'u1'))),
				false,
				'has for the same id under another subject type: types are part of the subject',
			);
			equal(
				await store.has(tuple(record, 'viewer', entity('team', 't1'))),
				false,
				'has for the entity of a stored subject set: a set is not its entity',
			);
			equal(
				await store.has(
					tuple(entity('record', 'r:1 — ÿ'), 'viewer', direct.subject),
				),
				false,
				'has for an id differing in one character: ids are compared as written',
			);
		},
	},
	{
		id: 'relations.edgeCharacters',
		group,
		name: 'round-trips every character the core lets through in an id: control characters, U+FFFF and a surrogate pair',
		async run({ store }) {
			// The core refuses a NUL and a lone surrogate before a store is
			// asked; everything else must come back exactly as written.
			const edge = 'a\u0001\u001f\u007f\uFFFF 😀 z';
			const record = entity('record', edge);
			const written = tuple(record, 'viewer', set('team', edge, 'member'));
			const direct = tuple(record, 'viewer', entity('staff', edge));
			await store.write({ add: [written, direct] });

			equal(await store.has(written), true, 'has for ids of edge characters');
			// Read back through every index: an adapter that mangles an id the
			// same way on write and on lookup still fails here.
			equal(
				await store.findSubjectSets(record, 'viewer'),
				[set('team', edge, 'member')],
				'findSubjectSets answers the set id as written',
			);
			equal(
				await store.findEntities(record, 'viewer'),
				[entity('staff', edge)],
				'findEntities answers the entity id as written',
			);
			equal(
				await store.findObjects({
					type: 'record',
					relation: 'viewer',
					subject: direct.subject,
					after: null,
					limit: 10,
				}),
				{ items: [edge], nextCursor: null },
				'findObjects answers the object id as written',
			);
			equal(
				await store.has(
					tuple(
						entity('record', edge.replace('😀', '😁')),
						'viewer',
						written.subject,
					),
				),
				false,
				'has for an id differing in one astral character',
			);
		},
	},
	{
		id: 'relations.undefinedRelation',
		group,
		name: 'reads a subject whose relation is undefined as its entity, not as a set',
		async run({ store }) {
			const record = entity('record');
			const staff = entity('staff');
			// A caller that spreads an optional field hands the port this shape.
			const spread = { ...staff, relation: undefined } as unknown as Subject;
			await store.write({ add: [tuple(record, 'viewer', spread)] });

			equal(
				await store.has(tuple(record, 'viewer', staff)),
				true,
				'has for the entity, after writing it with relation: undefined',
			);
			equal(
				await store.findEntities(record, 'viewer'),
				[staff],
				'findEntities: the tuple names an entity',
			);
			equal(
				await store.findSubjectSets(record, 'viewer'),
				[],
				'findSubjectSets: relation: undefined is no set',
			);
			equal(
				await store.findObjects({
					type: 'record',
					relation: 'viewer',
					subject: spread,
					after: null,
					limit: 10,
				}),
				{ items: [record.id], nextCursor: null },
				'findObjects for the subject written with relation: undefined',
			);
			equal(
				await store.findObjects({
					type: 'record',
					relation: 'viewer',
					subject: set('staff', staff.id, 'x'),
					after: null,
					limit: 10,
				}),
				{ items: [], nextCursor: null },
				'findObjects for a set of that entity: the entity is not a set',
			);
			await store.write({ remove: [tuple(record, 'viewer', spread)] });
			equal(
				await store.has(tuple(record, 'viewer', staff)),
				false,
				'has after removing it with relation: undefined',
			);
		},
	},
	{
		id: 'relations.absence',
		group,
		name: 'answers false, [], an empty page and 0 for an empty store — never null or undefined',
		async run({ store }) {
			const record = entity('record');
			const staff = entity('staff');

			equal(await store.has(tuple(record, 'viewer', staff)), false, 'has');
			equal(
				await store.findSubjectSets(record, 'viewer'),
				[],
				'findSubjectSets',
			);
			equal(await store.findEntities(record, 'viewer'), [], 'findEntities');
			equal(
				await store.findObjects({
					type: 'record',
					relation: 'viewer',
					subject: staff,
					after: null,
					limit: 10,
				}),
				{ items: [], nextCursor: null },
				'findObjects on an empty store',
			);
			equal(await store.deleteEntity(staff), 0, 'deleteEntity');
		},
	},
];
