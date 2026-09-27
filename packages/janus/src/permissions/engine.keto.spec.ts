import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import {
	offShift,
	record,
	setup,
	staff,
	team,
	untouchable,
} from './engine.fixtures';
import { createMemoryRelations } from './port/memory';

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
		expect(
			await setup(untouchable()).can(null, 'view', record(), offShift),
		).toBe(false);
	});
});
