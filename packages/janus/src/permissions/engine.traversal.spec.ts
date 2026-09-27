import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import {
	folder,
	offShift,
	patient,
	record,
	setup,
	staff,
	team,
} from './engine.fixtures';
import { createMemoryRelations } from './port/memory';

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
