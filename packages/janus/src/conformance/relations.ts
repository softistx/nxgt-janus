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

import { JanusError, StoreFailure } from '../errors/janus-error';
import { mintId } from '../ids/id';
import { createMemoryRelations } from '../permissions/port/memory';
import type { RelationStore } from '../permissions/port/types';
import { formatSubject } from '../subjects/notation';
import type {
	Entity,
	RelationTuple,
	Subject,
	SubjectSet,
} from '../subjects/subject';
import { equal, isOurs, ok, rejects } from './assert';
import { describeSuite, fromGlobals, SKIP_REASONS } from './describe';
import type { ConformanceRunner } from './types';

/** A method of the relation store. */
export type RelationMethod = keyof RelationStore & string;

/** How the suite makes one relation store method fail, for the outage cases. */
export interface RelationFaults {
	/**
	 * Fails `method`, and only it: the other methods keep answering, because
	 * `outage.write` reads the store back to prove the rejected write changed
	 * nothing.
	 */
	fail(method: RelationMethod): Promise<void>;
}

export interface OpenedRelations {
	/** Empty: every case writes what it reads. */
	readonly store: RelationStore;
	readonly faults?: RelationFaults;
	close?(): Promise<void>;
}

export interface RelationHarness {
	/** Called once per case, so no case sees another's tuples. */
	open(): Promise<OpenedRelations>;
}

export interface RelationContext {
	readonly store: RelationStore;
	readonly faults: RelationFaults | null;
}

export interface RelationCase {
	readonly id: string;
	readonly group: 'relations' | 'outage';
	readonly name: string;
	readonly needs?: 'faults';
	run(context: RelationContext): Promise<void>;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────

const entity = (type: string, id: string = mintId()): Entity => ({ type, id });
const set = (type: string, id: string, relation: string): SubjectSet => ({
	type,
	id,
	relation,
});
const tuple = (
	object: Entity,
	relation: string,
	subject: Subject,
): RelationTuple => ({ object, relation, subject });

/** Order-free, so a store may answer in any order. */
const sorted = (subjects: readonly Subject[]) =>
	subjects.map(formatSubject).sort();

// ─── The cases ────────────────────────────────────────────────────────────

const group = 'relations';

export const relationStoreCases: readonly RelationCase[] = [
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

// ─── Outages ──────────────────────────────────────────────────────────────

/**
 * For each method, a store that cannot answer must **reject** — never
 * `false`, `[]`, an empty page or `0`. A relation store that answers `false`
 * for an outage denies everybody everything and says nothing; one that
 * resolves a write it did not make leaves a revoked access standing.
 */
function outage(
	method: RelationMethod,
	call: (store: RelationStore) => Promise<unknown>,
	after?: (store: RelationStore) => Promise<void>,
): RelationCase {
	return {
		id: `outage.${method}`,
		group: 'outage',
		name: `relations.${method} rejects when the store cannot answer — never false, [], an empty page or 0`,
		needs: 'faults',
		async run({ store, faults }) {
			await store.write({ add: [seeded] });
			await faults?.fail(method);

			const error = await rejects(
				call(store),
				`relations.${method} under an outage should reject`,
			);
			if (
				error instanceof JanusError ||
				(error as { name?: unknown })?.name === 'StoreFailure'
			) {
				isOurs(error, StoreFailure, `relations.${method} under an outage`);
			}
			ok(
				(error as { code?: unknown } | null)?.code !== 'NOT_FOUND',
				`relations.${method} under an outage rejected with NOT_FOUND: an outage is never an absence`,
			);
			await after?.(store);
		},
	};
}

const seededObject: Entity = { type: 'record', id: 'seeded' };
const seededSubject: Entity = { type: 'staff', id: 'seeded' };
const seeded = tuple(seededObject, 'viewer', seededSubject);

export const relationOutageCases: readonly RelationCase[] = [
	outage(
		'write',
		(store) =>
			store.write({
				remove: [seeded],
				add: [tuple(seededObject, 'owner', seededSubject)],
			}),
		// A rejected write is one that did nothing: all of it, or none of it.
		async (store) => {
			equal(
				await store.has(seeded),
				true,
				'relations.write rejected, and still removed a tuple: a write is all or nothing',
			);
			equal(
				await store.has(tuple(seededObject, 'owner', seededSubject)),
				false,
				'relations.write rejected, and still added a tuple: a write is all or nothing',
			);
		},
	),
	outage('has', (store) => store.has(seeded)),
	outage('findSubjectSets', (store) =>
		store.findSubjectSets(seededObject, 'viewer'),
	),
	outage('findEntities', (store) => store.findEntities(seededObject, 'viewer')),
	outage('findObjects', (store) =>
		store.findObjects({
			type: 'record',
			relation: 'viewer',
			subject: seededSubject,
			after: null,
			limit: 10,
		}),
	),
	outage('deleteEntity', (store) => store.deleteEntity(seededSubject)),
];

export const allRelationCases: readonly RelationCase[] = [
	...relationStoreCases,
	...relationOutageCases,
];

// ─── Running them ─────────────────────────────────────────────────────────

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

/** The reference store, with faults: what the suite proves itself against. */
export function referenceRelationHarness(): RelationHarness {
	return {
		async open() {
			const failing = new Set<string>();
			const inner = createMemoryRelations();
			const store = Object.fromEntries(
				Object.entries(inner).map(([method, fn]) => [
					method,
					(...args: unknown[]) =>
						failing.has(method)
							? Promise.reject(
									new StoreFailure(
										`relations.${method}: the store could not answer`,
										{
											slot: 'relations',
											operation: method,
										},
									),
								)
							: (fn as (...a: unknown[]) => unknown).apply(inner, args),
				]),
			) as unknown as RelationStore;

			return {
				store,
				faults: {
					async fail(method) {
						failing.add(method);
					},
				},
			};
		},
	};
}
