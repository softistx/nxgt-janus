import { describe, expect, it } from 'bun:test';
import { InvalidCursorError } from '../errors/janus-error';
import { everyPage, setup } from './list.fixtures';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

const team = { type: 'team', id: 't1' } as const;

const staffNamed = (...ids: string[]) =>
	ids.map((id) => ({ type: 'staff', id }));

async function seeded(store?: RelationStore) {
	const access = setup(store);
	for (const id of ['u3', 'u1', 'Ana', 'u2', 'u10']) {
		await access.grant(team, 'members', { type: 'staff', id });
	}
	await access.grant(team, 'members', {
		type: 'team',
		id: 't2',
		relation: 'members',
	});
	return access;
}

/** The reference store without the optional method: the core's fallback. */
const withoutFindHolders = (): RelationStore => {
	const { findHolders: _omitted, ...rest } = createMemoryRelations();
	return rest;
};

describe.each([
	['a store with findHolders', () => createMemoryRelations()],
	['a store without findHolders', withoutFindHolders],
])('holders(), over %s', (_name, open) => {
	it('pages the single entities, ordered by id, with first and after', async () => {
		const access = await seeded(open());

		const first = await access.holders(team, 'members', { first: 2 });
		expect(first.items).toEqual(staffNamed('Ana', 'u1'));
		expect(first.nextCursor).not.toBeNull();
		const second = await access.holders(team, 'members', {
			first: 2,
			after: first.nextCursor,
		});
		expect(second.items).toEqual(staffNamed('u10', 'u2'));
		const third = await access.holders(team, 'members', {
			first: 2,
			after: second.nextCursor,
		});
		expect(third).toEqual({ items: staffNamed('u3'), nextCursor: null });
	});

	it('filters by a text the id contains, ignoring case, and pages the filtered list', async () => {
		const access = await seeded(open());

		expect(
			(await access.holders(team, 'members', { search: 'ANA' })).items,
		).toEqual(staffNamed('Ana'));
		const ids = await everyPage((after) =>
			access
				.holders(team, 'members', { search: 'u', first: 2, after })
				.then((page) => ({
					items: page.items.map((holder) => holder.id),
					nextCursor: page.nextCursor,
				})),
		);
		expect(ids).toEqual(['u1', 'u10', 'u2', 'u3']);
		expect(
			(await access.holders(team, 'members', { search: '%' })).items,
		).toEqual([]);
	});

	it('keeps what matches answers true, and still fills each page', async () => {
		const access = await seeded(open());
		const matches = async (holder: { id: string }) => holder.id.startsWith('u');

		const first = await access.holders(team, 'members', { first: 3, matches });
		expect(first.items).toEqual(staffNamed('u1', 'u10', 'u2'));
		const last = await access.holders(team, 'members', {
			first: 3,
			matches,
			after: first.nextCursor,
		});
		expect(last).toEqual({ items: staffNamed('u3'), nextCursor: null });
	});

	it('answers an empty page, never asks the store, for a search or cursor no store can keep', async () => {
		const access = await seeded(open());
		for (const search of ['a\u0000b', '\ud800']) {
			expect(await access.holders(team, 'members', { search })).toEqual({
				items: [],
				nextCursor: null,
			});
		}
		await expect(
			access.holders(team, 'members', { after: '5:staff\u0000' }),
		).rejects.toBeInstanceOf(InvalidCursorError);
	});

	it('answers an empty page for a relation nobody holds', async () => {
		const access = setup(open());
		expect(await access.holders(team, 'leads')).toEqual({
			items: [],
			nextCursor: null,
		});
	});

	it('refuses a cursor it did not mint, a bad first and a relation to read from a field', async () => {
		const access = await seeded(open());
		await expect(
			access.holders(team, 'members', { after: 'nope' }),
		).rejects.toBeInstanceOf(InvalidCursorError);
		await expect(access.holders(team, 'members', { first: 0 })).rejects.toThrow(
			'holders: limit must be',
		);
		await expect(
			// @ts-expect-error not a relation of team
			access.holders(team, 'nothing'),
		).rejects.toThrow('holders: "nothing" is not a relation of team');
	});
});
