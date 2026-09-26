import { describe, expect, it } from 'bun:test';
import { mintId } from '../ids/id';
import { parseSubject } from '../subjects/notation';
import { setOf } from '../subjects/subject';
import { permissions } from './engine';
import { defineModel, fromField, when } from './model';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

const model = defineModel({
	subjects: ['patient', 'staff'],
	types: {
		team: {
			related: { members: ['staff', 'team#members'], leads: ['staff'] },
			permits: { manage: ['leads'], view: ['members', 'manage'] },
		},
		folder: {
			related: { parents: ['folder'], owners: ['staff'] },
			permits: { view: ['owners', 'parents->view'] },
		},
		record: {
			related: {
				patients: fromField('patientId', 'patient'),
				doctors: fromField('doctorId', 'staff'),
				teams: ['team'],
				folders: ['folder'],
				viewers: ['staff', 'team#members'],
			},
			permits: {
				view: ['patients', 'viewers', 'teams->view', 'folders->view', 'edit'],
				edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

const staff = () => ({ type: 'staff' as const, id: mintId() });
const patient = () => ({ type: 'patient' as const, id: mintId() });
const team = () => ({ type: 'team' as const, id: mintId() });
const folder = () => ({ type: 'folder' as const, id: mintId() });
const record = (
	fields: { patientId?: string | null; doctorId?: string | null } = {},
) => ({
	type: 'record' as const,
	id: mintId(),
	patientId: fields.patientId ?? null,
	doctorId: fields.doctorId ?? null,
});
const offShift = { ctx: { onShift: false } };

const setup = (
	store: RelationStore = createMemoryRelations(),
	maxDepth?: number,
) =>
	permissions({
		model,
		store,
		...(maxDepth === undefined ? {} : { maxDepth }),
	});

/** Settles a rejection where it is created, per AGENTS.md. */
const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);

// The seven behaviours nxgt-ory measured against a live Keto, as specs here.
describe('the Keto behaviours', () => {
	it('a stored tuple grants its relation, to that subject only', async () => {
		const access = setup();
		const ada = staff();
		const doc = record();
		await access.grant(doc, 'viewers', ada);

		expect(await access.can(ada, 'viewers', doc)).toBe(true);
		expect(await access.can(staff(), 'viewers', doc)).toBe(false);
	});

	it('a denial is false, never a thrown error', async () => {
		expect(await setup().can(staff(), 'view', record(), offShift)).toBe(false);
	});

	it('follows a permission to another with no tuple for the one derived', async () => {
		const access = setup();
		const lead = staff();
		const t = team();
		await access.grant(t, 'leads', lead);

		// view includes manage, which includes leads: one write, two grants.
		expect(await access.can(lead, 'view', t)).toBe(true);
	});

	it('reaches a member through a group, though the member holds nothing on the object', async () => {
		const access = setup();
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'members', ada);
		await access.grant(doc, 'viewers', {
			type: 'team',
			id: t.id,
			relation: 'members',
		});

		expect(await access.can(ada, 'view', doc, offShift)).toBe(true);
	});

	it('follows groups nested in groups', async () => {
		const access = setup();
		const ada = staff();
		const [outer, inner] = [team(), team()];
		await access.grant(inner, 'members', ada);
		await access.grant(outer, 'members', {
			type: 'team',
			id: inner.id,
			relation: 'members',
		});

		expect(await access.can(ada, 'members', outer)).toBe(true);
	});

	it('answers a question whose subject is a subject set', async () => {
		const access = setup();
		const t = team();
		const doc = record();
		const members = { type: 'team', id: t.id, relation: 'members' } as const;
		await access.grant(doc, 'viewers', members);

		expect(await access.can(members, 'viewers', doc)).toBe(true);
	});

	it('follows only the subject sets the model admits, as list() does', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'leads', ada);
		// viewers admits team#members, not team#leads: written past grant(), as a
		// store shared with an older model could hold it.
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'viewers',
					subject: { type: 'team', id: t.id, relation: 'leads' },
				},
			],
		});

		expect(await access.can(ada, 'viewers', doc)).toBe(false);
		expect((await access.list(ada, 'viewers', 'record')).items).toEqual([]);
	});

	it('grants no direct tuple whose subject the model does not admit, as grant() refuses to write it', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const t = team();
		const doc = record();
		// viewers admits staff and team#members, not a team itself.
		const tuple = {
			object: { type: doc.type, id: doc.id },
			relation: 'viewers',
			subject: { type: 'team', id: t.id },
		};
		await store.write({ add: [tuple] });

		expect(await access.can(t, 'viewers', doc)).toBe(false);
		expect((await access.list(t, 'viewers', 'record')).items).toEqual([]);
		const refused = (await rejection(
			// @ts-expect-error record.viewers admits no team itself
			access.grant(doc, 'viewers', t),
		)) as Error;
		expect(refused.message).toContain('record.viewers is not held by team');

		// record.teams admits a team, not the set of its members.
		const ada = staff();
		await access.grant(t, 'members', ada);
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'teams',
					subject: { type: 'team', id: t.id, relation: 'members' },
				},
			],
		});
		expect(await access.can(ada, 'teams', doc)).toBe(false);
		expect((await access.list(ada, 'teams', 'record')).items).toEqual([]);
	});

	it('follows only the arrow targets the model admits', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'members', ada);
		// record.folders admits folder, not team: written past grant().
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'folders',
					subject: { type: 'team', id: t.id },
				},
			],
		});

		// list() cannot reverse record.view here (its fromFields have no
		// lookup); Reverse.arrow keeps only the declared holder types already.
		expect(await access.can(ada, 'view', doc, offShift)).toBe(false);
	});

	it('answers anonymous false before the store is called', async () => {
		const untouchable = new Proxy(createMemoryRelations(), {
			get: (target, method) =>
				typeof target[method as keyof RelationStore] === 'function'
					? () => {
							throw new Error(`called ${String(method)}`);
						}
					: undefined,
		});

		expect(await setup(untouchable).can(null, 'view', record(), offShift)).toBe(
			false,
		);
	});
});

describe('fromField and when', () => {
	it('reads a relation from the object itself, and null holds nobody', async () => {
		const access = setup();
		const [ada, bob] = [patient(), patient()];

		expect(
			await access.can(ada, 'patients', record({ patientId: ada.id })),
		).toBe(true);
		expect(
			await access.can(bob, 'patients', record({ patientId: ada.id })),
		).toBe(false);
		expect(await access.can(ada, 'patients', record())).toBe(false);
		// The same id under another subject type is somebody else.
		expect(
			await access.can(
				{ type: 'staff', id: ada.id },
				'patients',
				record({ patientId: ada.id }),
			),
		).toBe(false);
	});

	it('grants under a condition only when the condition holds', async () => {
		const access = setup();
		const doctor = staff();
		const doc = record({ doctorId: doctor.id });

		expect(
			await access.can(doctor, 'edit', doc, { ctx: { onShift: true } }),
		).toBe(true);
		expect(await access.can(doctor, 'edit', doc, offShift)).toBe(false);
		// view reaches edit: the doctor off shift may not view either.
		expect(await access.can(doctor, 'view', doc, offShift)).toBe(false);
	});

	it('refuses a missing ctx or a missing field as the caller’s bug, not a denial', async () => {
		const access = setup();
		const doctor = staff();
		const doc = record({ doctorId: doctor.id });

		expect(
			await rejection(access.can(doctor, 'edit', doc, {} as never)),
		).toBeInstanceOf(TypeError);
		const { doctorId: _, ...withoutDoctor } = doc;
		const missing = await rejection(
			access.can(doctor, 'doctors', withoutDoctor as never),
		);
		expect(missing).toBeInstanceOf(TypeError);
		expect((missing as Error).message).toContain('reads doctorId');
	});
});

describe('arrows', () => {
	it('follows a record to its team, and a folder to its parents', async () => {
		const access = setup();
		const [lead, owner] = [staff(), staff()];
		const t = team();
		const [root, sub] = [folder(), folder()];
		const doc = record();
		await access.grant(t, 'leads', lead);
		await access.grant(doc, 'teams', t);
		await access.grant(root, 'owners', owner);
		await access.grant(sub, 'parents', root);
		await access.grant(doc, 'folders', sub);

		expect(await access.can(lead, 'view', doc, offShift)).toBe(true);
		expect(await access.can(owner, 'view', doc, offShift)).toBe(true);
		expect(await access.can(staff(), 'view', doc, offShift)).toBe(false);
	});
});

describe('cycles and depth', () => {
	it('cuts a cycle in the data without an error, and still finds a member through it', async () => {
		const access = setup();
		const [a, b] = [team(), team()];
		const ada = staff();
		await access.grant(a, 'members', {
			type: 'team',
			id: b.id,
			relation: 'members',
		});
		await access.grant(b, 'members', {
			type: 'team',
			id: a.id,
			relation: 'members',
		});
		await access.grant(b, 'members', ada);

		expect(await access.can(staff(), 'members', a)).toBe(false);
		expect(await access.can(ada, 'members', a)).toBe(true);
	});

	it('throws PERMISSION_DEPTH past maxDepth, and answers within it', async () => {
		const owner = staff();
		const store = createMemoryRelations();
		const chain = Array.from({ length: 12 }, folder);
		const shallow = setup(store, 20);
		await shallow.grant(chain[0] ?? folder(), 'owners', owner);
		for (let n = 1; n < chain.length; n += 1) {
			await shallow.grant(
				chain[n] ?? folder(),
				'parents',
				chain[n - 1] ?? folder(),
			);
		}
		const deepest = chain.at(-1) ?? folder();

		expect(await shallow.can(owner, 'view', deepest)).toBe(true);
		const error = (await rejection(
			setup(store, 5).can(owner, 'view', deepest),
		)) as {
			code: string;
			permission: string;
			maxDepth: number;
		};
		expect(error.code).toBe('PERMISSION_DEPTH');
		expect(error.permission).toBe('folder#view');
		expect(error.maxDepth).toBe(5);
	});
});

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

describe('grant and revoke', () => {
	it('revokes what was granted, and revoking twice is not an error', async () => {
		const access = setup();
		const ada = staff();
		const t = team();
		await access.grant(t, 'members', ada);
		await access.revoke(t, 'members', ada);
		await access.revoke(t, 'members', ada);

		expect(await access.can(ada, 'members', t)).toBe(false);
	});

	it('treats a user as a user, whatever fields it carries', async () => {
		const access = setup();
		const t = team();
		// A user's fields are flat on it; one named relation is still a field.
		const ada = { ...staff(), relation: 'cousin', name: 'Ada' };
		await access.grant(t, 'members', ada);

		expect(await access.can({ type: 'staff', id: ada.id }, 'members', t)).toBe(
			true,
		);
	});

	const cases: [
		string,
		(access: ReturnType<typeof setup>) => Promise<unknown>,
		string,
	][] = [
		[
			'a relation read from a field',
			(access) => access.grant(record(), 'doctors' as never, staff() as never),
			'is read from doctorId',
		],
		[
			'a holder the relation does not admit',
			(access) => access.grant(team(), 'leads', patient() as never),
			'team.leads is not held by patient',
		],
		[
			'an id the notation would read two ways',
			(access) => access.grant({ type: 'team', id: 't#1' }, 'members', staff()),
			'without @, # or parentheses',
		],
		[
			'an object type the model does not declare',
			(access) =>
				access.grant(
					{ type: 'ward', id: 'w' } as never,
					'members' as never,
					staff() as never,
				),
			'"ward" is not an object type',
		],
		[
			'a permission can() does not know',
			(access) => access.can(staff(), 'edti' as never, team()),
			'"edti" is not a relation or a permission of team',
		],
	];
	for (const [name, call, message] of cases) {
		it(`refuses ${name} with a TypeError`, async () => {
			const error = await rejection(call(setup()));
			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toContain(message);
		});
	}
});

describe('wiring', () => {
	it('refuses a store missing a method, and a maxDepth under 1', () => {
		const { findObjects: _, ...partial } = createMemoryRelations();

		expect(() => permissions({ model, store: partial as never })).toThrow(
			'store.findObjects is missing',
		);
		expect(() =>
			permissions({ model, store: createMemoryRelations(), maxDepth: 0 }),
		).toThrow('maxDepth must be a positive integer');
	});
});

describe('a user type that is also an object type', () => {
	const people = defineModel({
		subjects: ['staff'],
		types: {
			staff: {
				related: { managers: ['staff', 'staff#managers'] },
				permits: { edit: ['managers'] },
			},
			note: {
				related: { readers: ['staff', 'staff#managers'] },
				permits: { read: ['readers'] },
			},
		},
	});
	const note = () => ({ type: 'note' as const, id: mintId() });

	it('a user is checked as an object, and relations chain through users', async () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const [ada, bob, cyd] = [staff(), staff(), staff()];
		await access.grant(ada, 'managers', bob);
		await access.grant(bob, 'managers', setOf(cyd, 'managers'));
		const dee = staff();
		await access.grant(cyd, 'managers', dee);

		expect(await access.can(bob, 'edit', ada)).toBe(true);
		expect(await access.can(ada, 'edit', bob)).toBe(false);
		expect(await access.can(dee, 'edit', bob)).toBe(true);
		expect(await access.can(cyd, 'edit', bob)).toBe(false);
	});

	it('setOf() grants everyone holding the relation on that user', async () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const [ada, boss] = [staff(), staff()];
		const doc = note();
		await access.grant(ada, 'managers', boss);
		await access.grant(doc, 'readers', setOf(ada, 'managers'));

		expect(await access.can(boss, 'read', doc)).toBe(true);
		expect(await access.can(ada, 'read', doc)).toBe(false);
	});

	it('a user whose fields include relation stays that user', async () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const [ada, boss] = [staff(), staff()];
		const doc = note();
		const withRelation = { ...ada, relation: 'managers' };
		await access.grant(ada, 'managers', boss);
		await access.grant(doc, 'readers', withRelation);

		expect(await access.can(ada, 'read', doc)).toBe(true);
		expect(await access.can(boss, 'read', doc)).toBe(false);
	});

	it('revoke removes the set, from setOf(), a spread of it or its notation', async () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const [ada, boss] = [staff(), staff()];
		const doc = note();
		await access.grant(ada, 'managers', boss);

		for (const set of [
			setOf(ada, 'managers'),
			{ ...setOf(ada, 'managers') },
			parseSubject(`staff:${ada.id}#managers`),
		]) {
			await access.grant(doc, 'readers', setOf(ada, 'managers'));
			expect(await access.can(boss, 'read', doc)).toBe(true);
			await access.revoke(doc, 'readers', set as never);
			expect(await access.can(boss, 'read', doc)).toBe(false);
		}
	});

	it('list() takes a set on a user type as its subject', async () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const ada = staff();
		const doc = note();
		await access.grant(doc, 'readers', setOf(ada, 'managers'));

		const page = await access.list(setOf(ada, 'managers'), 'read', 'note');
		expect(page.items).toEqual([doc.id]);
		expect((await access.list(ada, 'read', 'note')).items).toEqual([]);
	});

	it('setOf() naming no relation of the user type is refused', () => {
		const access = permissions({
			model: people,
			store: createMemoryRelations(),
		});
		const ada = staff();
		const call = () =>
			access.grant(note(), 'readers', setOf(ada, 'reports') as never);

		expect(call).toThrow(TypeError);
		expect(call).toThrow(
			`"reports" is not a relation of staff, so staff:${ada.id}#reports is no subject set`,
		);
	});

	it('setOf() on a type the model does not know says so', () => {
		const call = () =>
			setup().grant(
				record(),
				'viewers',
				setOf({ type: 'ward', id: 'w1' }, 'nurses') as never,
			);

		expect(call).toThrow(TypeError);
		expect(call).toThrow('"ward" is not an object type of the model');
	});

	it('setOf() on a user type that is no object type is refused', async () => {
		const access = setup();
		// The compiler refuses it too: record.viewers admits no set on staff.
		const call = () =>
			access.grant(record(), 'viewers', setOf(staff(), 'members') as never);

		expect(call).toThrow(TypeError);
		expect(call).toThrow(
			'staff is a user type the model does not declare as an object type',
		);
	});

	it('setOf() on an object type is the set it writes', async () => {
		const access = setup();
		const [ada, crew] = [staff(), team()];
		const doc = record();
		await access.grant(crew, 'members', ada);
		await access.grant(doc, 'viewers', setOf(crew, 'members'));

		expect(await access.can(ada, 'view', doc, offShift)).toBe(true);
	});
});
