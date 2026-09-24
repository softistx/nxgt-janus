import { describe, expect, it } from 'bun:test';
import { permissions } from './engine';
import { defineModel, fromField, when } from './model';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

/** The fields of the objects of one test, by id: what an application's tables hold. */
type Rows = Map<string, Readonly<Record<string, string | null>>>;

const modelOver = (rows: Rows) => {
	const naming = (field: string) => async (id: string) =>
		[...rows].filter(([, row]) => row[field] === id).map(([key]) => key);
	return defineModel({
		subjects: ['patient', 'staff'],
		types: {
			team: {
				relations: { member: ['staff', 'team#member'], lead: ['staff'] },
				permissions: { manage: ['lead'], view: ['member', 'manage'] },
			},
			folder: {
				relations: { parent: ['folder'], owner: ['staff'] },
				permissions: { view: ['owner', 'parent->view'] },
			},
			record: {
				relations: {
					patient: fromField('patientId', 'patient', {
						lookup: naming('patientId'),
					}),
					doctor: fromField('doctorId', 'staff', {
						lookup: naming('doctorId'),
					}),
					team: ['team'],
					folder: ['folder'],
					viewer: ['staff', 'team#member'],
				},
				permissions: {
					view: ['patient', 'viewer', 'team->view', 'folder->view', 'edit'],
					edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
			// An arrow through a fromField: list() reverses it with the lookup.
			note: {
				relations: {
					team: fromField('teamId', 'team', { lookup: naming('teamId') }),
				},
				permissions: { view: ['team->view'] },
			},
		},
	});
};

/** mulberry32: a seeded generator, so a failing graph can be replayed. */
const generator = (seed: number) => () => {
	seed = (seed + 0x6d2b79f5) | 0;
	let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
	t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
	return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Every page of a list, read with a small limit so paging is walked too. */
async function everyPage(
	read: (after: string | null) => Promise<{
		items: readonly string[];
		nextCursor: string | null;
	}>,
): Promise<string[]> {
	const ids: string[] = [];
	let after: string | null = null;
	do {
		const page = await read(after);
		ids.push(...page.items);
		after = page.nextCursor;
	} while (after !== null);
	return ids;
}

/** Settles a rejection where it is created, per AGENTS.md. */
const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);

describe('list() is can() over every object', () => {
	const seeds = Array.from({ length: 40 }, (_, n) => n + 1);

	for (const seed of seeds) {
		it(`agrees with can() on random graph ${seed}`, async () => {
			const random = generator(seed);
			const pick = <T>(items: readonly T[]): T =>
				items[Math.floor(random() * items.length)] as T;
			const ids = (prefix: string, count: number) =>
				Array.from({ length: count }, (_, n) => `${prefix}${n}`);

			// Shared ids: patient u0 and staff u0 are two people.
			const staffIds = ids('u', 4);
			const patientIds = ids('u', 3);
			const teamIds = ids('t', 4);
			const folderIds = ids('f', 4);
			const recordIds = ids('r', 6);
			const noteIds = ids('n', 4);

			const rows: Rows = new Map<
				string,
				Readonly<Record<string, string | null>>
			>([
				...recordIds.map(
					(id) =>
						[
							id,
							{
								patientId: random() < 0.6 ? pick(patientIds) : null,
								doctorId: random() < 0.6 ? pick(staffIds) : null,
							},
						] as const,
				),
				...noteIds.map(
					(id) =>
						[id, { teamId: random() < 0.7 ? pick(teamIds) : null }] as const,
				),
			]);
			const store = createMemoryRelations();
			const access = permissions({ model: modelOver(rows), store });
			// The same grants, without the tuples the model does not admit.
			const clean = permissions({
				model: modelOver(rows),
				store: createMemoryRelations(),
			});
			const grant = (async (object: never, relation: never, subject: never) => {
				await clean.grant(object, relation, subject);
				await access.grant(object, relation, subject);
			}) as typeof access.grant;

			const staff = (id: string) => ({ type: 'staff' as const, id });
			const team = (id: string) => ({ type: 'team' as const, id });
			const folder = (id: string) => ({ type: 'folder' as const, id });
			const members = (id: string) => ({
				type: 'team' as const,
				id,
				relation: 'member' as const,
			});
			const record = (id: string) => ({ type: 'record' as const, id });

			for (let n = 0; n < 30; n += 1) {
				switch (Math.floor(random() * 8)) {
					case 0:
						await grant(team(pick(teamIds)), 'member', staff(pick(staffIds)));
						break;
					case 1:
						// Cycles included: a team may end up a member of itself.
						await grant(team(pick(teamIds)), 'member', members(pick(teamIds)));
						break;
					case 2:
						await grant(team(pick(teamIds)), 'lead', staff(pick(staffIds)));
						break;
					case 3:
						await grant(
							folder(pick(folderIds)),
							'parent',
							folder(pick(folderIds)),
						);
						break;
					case 4:
						await grant(
							folder(pick(folderIds)),
							'owner',
							staff(pick(staffIds)),
						);
						break;
					case 5:
						await grant(record(pick(recordIds)), 'team', team(pick(teamIds)));
						break;
					case 6:
						await grant(
							record(pick(recordIds)),
							'folder',
							folder(pick(folderIds)),
						);
						break;
					default:
						await grant(
							record(pick(recordIds)),
							'viewer',
							random() < 0.5 ? staff(pick(staffIds)) : members(pick(teamIds)),
						);
				}
			}

			// Stored past grant(), and admitted nowhere: each grants nothing.
			const stale = (
				object: { type: string; id: string },
				relation: string,
				subject: { type: string; id: string; relation?: string },
			) => store.write({ add: [{ object, relation, subject }] });
			for (let n = 0; n < 12; n += 1) {
				const kind = Math.floor(random() * 6);
				if (kind === 0)
					await stale(record(pick(recordIds)), 'viewer', team(pick(teamIds)));
				if (kind === 1)
					await stale(record(pick(recordIds)), 'team', members(pick(teamIds)));
				if (kind === 2)
					await stale(record(pick(recordIds)), 'folder', team(pick(teamIds)));
				if (kind === 3)
					await stale(team(pick(teamIds)), 'member', {
						...members(pick(teamIds)),
						relation: 'lead',
					});
				if (kind === 4)
					await stale(folder(pick(folderIds)), 'owner', {
						type: 'patient',
						id: pick(patientIds),
					});
				if (kind === 5)
					await stale(record(pick(recordIds)), 'viewer', {
						type: 'folder',
						id: pick(folderIds),
						relation: 'owner',
					});
			}

			const subjects = [
				...staffIds.map(staff),
				...patientIds.map((id) => ({ type: 'patient' as const, id })),
				...teamIds.map(team),
				...teamIds.map(members),
				...folderIds.map(folder),
			];
			const questions = [
				['team', teamIds, ['member', 'lead', 'manage', 'view']],
				['folder', folderIds, ['parent', 'owner', 'view']],
				[
					'record',
					recordIds,
					['patient', 'doctor', 'team', 'folder', 'viewer', 'view', 'edit'],
				],
				['note', noteIds, ['team', 'view']],
			] as const;

			for (const onShift of [true, false]) {
				const ctx = { onShift };
				for (const subject of subjects) {
					for (const [type, objects, names] of questions) {
						for (const name of names) {
							const expected: string[] = [];
							for (const id of objects) {
								const object = { type, id, ...rows.get(id) };
								const granted = await access.can(
									subject,
									name as never,
									object as never,
									{ ctx } as never,
								);
								expect(granted).toBe(
									await clean.can(
										subject,
										name as never,
										object as never,
										{ ctx } as never,
									),
								);
								if (granted) expected.push(id);
							}
							const listed = await everyPage((after) =>
								access.list(subject, name as never, type, {
									ctx,
									after,
									limit: 2,
								} as never),
							);
							expect({ subject, name, type, ids: listed }).toEqual({
								subject,
								name,
								type,
								ids: expected,
							});
						}
					}
				}
			}
		});
	}
});

describe('list()', () => {
	const setup = (
		store: RelationStore = createMemoryRelations(),
		maxDepth?: number,
	) =>
		permissions({
			model: modelOver(new Map()),
			store,
			...(maxDepth === undefined ? {} : { maxDepth }),
		});
	const ada = { type: 'staff', id: 'ada' } as const;

	it('pages in ascending id order, from a cursor that need not name an object', async () => {
		const access = setup();
		for (const id of ['t3', 't1', 't4', 't2']) {
			await access.grant({ type: 'team', id }, 'member', ada);
		}

		expect(await access.list(ada, 'member', 'team', { limit: 3 })).toEqual({
			items: ['t1', 't2', 't3'],
			nextCursor: 't3',
		});
		expect(await access.list(ada, 'member', 'team', { after: 't3' })).toEqual({
			items: ['t4'],
			nextCursor: null,
		});
		expect(
			await access.list(ada, 'member', 'team', { after: 't2x', limit: 1 }),
		).toEqual({ items: ['t3'], nextCursor: 't3' });
		expect(await access.list(ada, 'lead', 'team')).toEqual({
			items: [],
			nextCursor: null,
		});
	});

	it('walks every page the store answers, past the largest', async () => {
		const access = setup();
		const ids = Array.from(
			{ length: 105 },
			(_, n) => `t${String(n).padStart(3, '0')}`,
		);
		for (const id of ids) {
			await access.grant({ type: 'team', id }, 'member', ada);
		}

		const listed = await everyPage((after) =>
			access.list(ada, 'member', 'team', { after, limit: 100 }),
		);
		expect(listed).toEqual(ids);
	});

	it('answers anonymous an empty page before the store is called', async () => {
		const untouchable = new Proxy(createMemoryRelations(), {
			get: (target, method) =>
				typeof target[method as keyof RelationStore] === 'function'
					? () => {
							throw new Error(`called ${String(method)}`);
						}
					: undefined,
		});

		expect(
			await setup(untouchable).list(null, 'view', 'record', {
				ctx: { onShift: true },
			}),
		).toEqual({ items: [], nextCursor: null });
	});

	it('throws PERMISSION_DEPTH past maxDepth, and answers within it', async () => {
		const store = createMemoryRelations();
		const deep = setup(store, 20);
		const folder = (n: number) => ({
			type: 'folder' as const,
			id: `f${String(n).padStart(2, '0')}`,
		});
		await deep.grant(folder(0), 'owner', ada);
		for (let n = 1; n < 12; n += 1) {
			await deep.grant(folder(n), 'parent', folder(n - 1));
		}

		expect((await deep.list(ada, 'view', 'folder')).items).toHaveLength(12);
		const error = (await rejection(
			setup(store, 5).list(ada, 'view', 'folder'),
		)) as {
			code: string;
			permission: string;
			maxDepth: number;
		};
		expect(error.code).toBe('PERMISSION_DEPTH');
		expect(error.permission).toBe('folder#view');
		expect(error.maxDepth).toBe(5);
	});

	it('rejects STORE_FAILED when findObjects cannot answer, and a failing lookup as it failed', async () => {
		const failing = setup({
			...createMemoryRelations(),
			findObjects: async () => {
				throw new Error('primary stepped down');
			},
		});
		const error = (await rejection(failing.list(ada, 'member', 'team'))) as {
			code: string;
		};
		expect(error.code).toBe('STORE_FAILED');

		const outage = new Error('records table unreachable');
		const access = permissions({
			model: defineModel({
				subjects: ['staff'],
				types: {
					record: {
						relations: {
							doctor: fromField('doctorId', 'staff', {
								lookup: async () => {
									throw outage;
								},
							}),
						},
					},
				},
			}),
			store: createMemoryRelations(),
		});
		expect(await rejection(access.list(ada, 'doctor', 'record'))).toBe(outage);
	});

	const unreversible = defineModel({
		subjects: ['staff'],
		types: {
			record: {
				relations: {
					doctor: fromField('doctorId', 'staff'),
					viewer: ['staff'],
				},
				permissions: {
					view: ['viewer', 'doctor'],
					edit: [when('viewer', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
		},
	});
	const cases: [string, () => Promise<unknown>, string][] = [
		[
			'a fromField with no lookup',
			() =>
				permissions({
					model: unreversible,
					store: createMemoryRelations(),
				}).list(ada, 'view' as never, 'record'),
			'record.doctor is read from a field, and has no lookup',
		],
		[
			'a condition with no ctx',
			() =>
				permissions({
					model: unreversible,
					store: createMemoryRelations(),
				}).list(ada, 'edit', 'record', {} as never),
			'record.edit reaches a condition, and no ctx was passed',
		],
		[
			'a type the model does not declare',
			() => setup().list(ada, 'view' as never, 'ward' as never),
			'"ward" is not an object type',
		],
		[
			'a name the type does not declare',
			() => setup().list(ada, 'edti' as never, 'team'),
			'"edti" is not a relation or a permission of team',
		],
		[
			'a limit under 1',
			() => setup().list(ada, 'member', 'team', { limit: 0 }),
			'limit must be an integer',
		],
	];
	for (const [name, call, message] of cases) {
		it(`refuses ${name} with a TypeError`, async () => {
			const error = await rejection(call());
			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toContain(message);
		});
	}
});
