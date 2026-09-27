import { describe, expect, it } from 'bun:test';
import { mintId } from '../ids/id';
import { parseSubject } from '../subjects/notation';
import { setOf } from '../subjects/subject';
import { permissions } from './engine';
import { offShift, record, setup, staff, team } from './engine.fixtures';
import { defineModel } from './model/define';
import { createMemoryRelations } from './port/memory';

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
		// can() reads it the same way: a question about ada, not her managers.
		expect(await access.can(withRelation, 'read', doc)).toBe(true);
		expect(
			await access.can({ ...boss, relation: 'managers' }, 'read', doc),
		).toBe(false);
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
			'"reports" is not a relation of staff, so staff#reports is no subject set',
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
