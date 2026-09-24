import { describe, expect, it } from 'bun:test';
import { mintId } from '../ids/id';
import { permissions } from './engine';
import { defineModel, fromField, when } from './model';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

const model = defineModel({
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
				patient: fromField('patientId', 'patient'),
				doctor: fromField('doctorId', 'staff'),
				team: ['team'],
				folder: ['folder'],
				viewer: ['staff', 'team#member'],
			},
			permissions: {
				view: ['patient', 'viewer', 'team->view', 'folder->view', 'edit'],
				edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
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
		await access.grant(doc, 'viewer', ada);

		expect(await access.can(ada, 'viewer', doc)).toBe(true);
		expect(await access.can(staff(), 'viewer', doc)).toBe(false);
	});

	it('a denial is false, never a thrown error', async () => {
		expect(await setup().can(staff(), 'view', record(), offShift)).toBe(false);
	});

	it('follows a permission to another with no tuple for the one derived', async () => {
		const access = setup();
		const lead = staff();
		const t = team();
		await access.grant(t, 'lead', lead);

		// view includes manage, which includes lead: one write, two grants.
		expect(await access.can(lead, 'view', t)).toBe(true);
	});

	it('reaches a member through a group, though the member holds nothing on the object', async () => {
		const access = setup();
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'member', ada);
		await access.grant(doc, 'viewer', {
			type: 'team',
			id: t.id,
			relation: 'member',
		});

		expect(await access.can(ada, 'view', doc, offShift)).toBe(true);
	});

	it('follows groups nested in groups', async () => {
		const access = setup();
		const ada = staff();
		const [outer, inner] = [team(), team()];
		await access.grant(inner, 'member', ada);
		await access.grant(outer, 'member', {
			type: 'team',
			id: inner.id,
			relation: 'member',
		});

		expect(await access.can(ada, 'member', outer)).toBe(true);
	});

	it('answers a question whose subject is a subject set', async () => {
		const access = setup();
		const t = team();
		const doc = record();
		const members = { type: 'team', id: t.id, relation: 'member' } as const;
		await access.grant(doc, 'viewer', members);

		expect(await access.can(members, 'viewer', doc)).toBe(true);
	});

	it('follows only the subject sets the model admits, as list() does', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'lead', ada);
		// viewer admits team#member, not team#lead: written past grant(), as a
		// store shared with an older model could hold it.
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'viewer',
					subject: { type: 'team', id: t.id, relation: 'lead' },
				},
			],
		});

		expect(await access.can(ada, 'viewer', doc)).toBe(false);
		expect((await access.list(ada, 'viewer', 'record')).items).toEqual([]);
	});

	it('grants no direct tuple whose subject the model does not admit, as grant() refuses to write it', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const t = team();
		const doc = record();
		// viewer admits staff and team#member, not a team itself.
		const tuple = {
			object: { type: doc.type, id: doc.id },
			relation: 'viewer',
			subject: { type: 'team', id: t.id },
		};
		await store.write({ add: [tuple] });

		expect(await access.can(t, 'viewer', doc)).toBe(false);
		expect((await access.list(t, 'viewer', 'record')).items).toEqual([]);
		const refused = (await rejection(
			// @ts-expect-error record.viewer admits no team itself
			access.grant(doc, 'viewer', t),
		)) as Error;
		expect(refused.message).toContain('record.viewer is not held by team');

		// record.team admits a team, not the set of its members.
		const ada = staff();
		await access.grant(t, 'member', ada);
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'team',
					subject: { type: 'team', id: t.id, relation: 'member' },
				},
			],
		});
		expect(await access.can(ada, 'team', doc)).toBe(false);
	});

	it('follows only the arrow targets the model admits', async () => {
		const store = createMemoryRelations();
		const access = setup(store);
		const ada = staff();
		const t = team();
		const doc = record();
		await access.grant(t, 'member', ada);
		// record.folder admits folder, not team: written past grant().
		await store.write({
			add: [
				{
					object: { type: doc.type, id: doc.id },
					relation: 'folder',
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
			await access.can(ada, 'patient', record({ patientId: ada.id })),
		).toBe(true);
		expect(
			await access.can(bob, 'patient', record({ patientId: ada.id })),
		).toBe(false);
		expect(await access.can(ada, 'patient', record())).toBe(false);
		// The same id under another subject type is somebody else.
		expect(
			await access.can(
				{ type: 'staff', id: ada.id },
				'patient',
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
			access.can(doctor, 'doctor', withoutDoctor as never),
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
		await access.grant(t, 'lead', lead);
		await access.grant(doc, 'team', t);
		await access.grant(root, 'owner', owner);
		await access.grant(sub, 'parent', root);
		await access.grant(doc, 'folder', sub);

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
		await access.grant(a, 'member', {
			type: 'team',
			id: b.id,
			relation: 'member',
		});
		await access.grant(b, 'member', {
			type: 'team',
			id: a.id,
			relation: 'member',
		});
		await access.grant(b, 'member', ada);

		expect(await access.can(staff(), 'member', a)).toBe(false);
		expect(await access.can(ada, 'member', a)).toBe(true);
	});

	it('throws PERMISSION_DEPTH past maxDepth, and answers within it', async () => {
		const owner = staff();
		const store = createMemoryRelations();
		const chain = Array.from({ length: 12 }, folder);
		const shallow = setup(store, 20);
		await shallow.grant(chain[0] ?? folder(), 'owner', owner);
		for (let n = 1; n < chain.length; n += 1) {
			await shallow.grant(
				chain[n] ?? folder(),
				'parent',
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
			await access.grant(doc, 'viewer', {
				type: 'team',
				id: t.id,
				relation: 'member',
			});
			await access.grant(doc, 'team', t);

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
			access.grant(team(), 'member', staff()),
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
		await access.grant(t, 'member', ada);
		await access.revoke(t, 'member', ada);
		await access.revoke(t, 'member', ada);

		expect(await access.can(ada, 'member', t)).toBe(false);
	});

	it('treats a user as a user, whatever fields it carries', async () => {
		const access = setup();
		const t = team();
		// A user's fields are flat on it; one named relation is still a field.
		const ada = { ...staff(), relation: 'cousin', name: 'Ada' };
		await access.grant(t, 'member', ada);

		expect(await access.can({ type: 'staff', id: ada.id }, 'member', t)).toBe(
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
			(access) => access.grant(record(), 'doctor' as never, staff() as never),
			'is read from doctorId',
		],
		[
			'a holder the relation does not admit',
			(access) => access.grant(team(), 'lead', patient() as never),
			'team.lead is not held by patient',
		],
		[
			'an id the notation would read two ways',
			(access) => access.grant({ type: 'team', id: 't#1' }, 'member', staff()),
			'without @, # or parentheses',
		],
		[
			'an object type the model does not declare',
			(access) =>
				access.grant(
					{ type: 'ward', id: 'w' } as never,
					'member' as never,
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
