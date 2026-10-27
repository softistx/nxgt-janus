import { describe, expect, it } from 'bun:test';
import type { CursorPage } from '../pagination/cursor-page';
import type { Entity } from '../subjects/subject';
import { setup } from './list.fixtures';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

const team = { type: 'team', id: 't1' } as const;

/** The reference store without the optional method: the core's fallback. */
const withoutFindHolders = (): RelationStore => {
	const { findHolders: _omitted, ...rest } = createMemoryRelations();
	return rest;
};

describe.each([
	['a store with findHolders', () => createMemoryRelations()],
	['a store without findHolders', withoutFindHolders],
])('holders() with a selective predicate, over %s', (_name, open) => {
	const ids = Array.from(
		{ length: 250 },
		(_, i) => `u${String(i).padStart(3, '0')}`,
	);

	async function crowded() {
		const access = setup(open());
		for (const id of ids) {
			await access.grant(team, 'members', { type: 'staff', id });
		}
		return access;
	}

	it('asks the predicate for at most scanLimit holders, then resumes from a cursor', async () => {
		const access = await crowded();
		let calls = 0;
		const matches = async (holder: { id: string }) => {
			calls += 1;
			return holder.id === 'u240';
		};

		const found: string[] = [];
		let after: string | null = null;
		let pages = 0;
		do {
			const before = calls;
			const page: CursorPage<Entity> = await access.holders(team, 'members', {
				first: 20,
				scanLimit: 100,
				matches,
				after,
			});
			expect(calls - before).toBeLessThanOrEqual(100);
			found.push(...page.items.map((h) => h.id));
			after = page.nextCursor;
			pages += 1;
		} while (after !== null);

		expect(found).toEqual(['u240']);
		expect(pages).toBe(3);
		expect(calls).toBe(250);
	});

	it('answers an empty page with a cursor when nothing was kept within the budget', async () => {
		const access = await crowded();
		const page: CursorPage<Entity> = await access.holders(team, 'members', {
			scanLimit: 10,
			matches: () => false,
		});
		expect(page.items).toEqual([]);
		expect(page.nextCursor).not.toBeNull();
		const rest = await access.holders(team, 'members', {
			scanLimit: Number.POSITIVE_INFINITY,
			matches: () => false,
			after: page.nextCursor,
		});
		expect(rest).toEqual({ items: [], nextCursor: null });
	});

	it('looks at a whole relation under the default scanLimit of 500', async () => {
		const access = await crowded();
		let calls = 0;
		const page: CursorPage<Entity> = await access.holders(team, 'members', {
			matches: () => {
				calls += 1;
				return false;
			},
		});
		expect(calls).toBe(250);
		expect(page).toEqual({ items: [], nextCursor: null });
	});

	it('stops asking matches once the page is full', async () => {
		const access = await crowded();
		let calls = 0;
		const page = await access.holders(team, 'members', {
			first: 2,
			matches: () => {
				calls += 1;
				return true;
			},
		});
		expect(page.items).toHaveLength(2);
		expect(calls).toBe(3);
	});

	it('reads a page of holders in one matchesMany call', async () => {
		const access = await crowded();
		const batches: number[] = [];
		const page: CursorPage<Entity> = await access.holders(team, 'members', {
			first: 5,
			matchesMany: (batch) => {
				batches.push(batch.length);
				return batch.map((h) => h.id.endsWith('7'));
			},
		});
		expect(page.items.map((h) => h.id)).toEqual([
			'u007',
			'u017',
			'u027',
			'u037',
			'u047',
		]);
		expect(batches).toEqual([100]);
		const next = await access.holders(team, 'members', {
			first: 5,
			matchesMany: (batch) => batch.map((h) => h.id.endsWith('7')),
			after: page.nextCursor,
		});
		expect(next.items.map((h) => h.id)).toEqual([
			'u057',
			'u067',
			'u077',
			'u087',
			'u097',
		]);
	});

	it('refuses matches with matchesMany, a bad scanLimit and a matchesMany that miscounts', async () => {
		const access = await crowded();
		await expect(
			access.holders(team, 'members', {
				matches: () => true,
				matchesMany: (b) => b.map(() => true),
			}),
		).rejects.toThrow('holders: matches and matchesMany are exclusive');
		for (const scanLimit of [0, 1.5, -1, Number.NaN]) {
			await expect(
				access.holders(team, 'members', { scanLimit, matches: () => true }),
			).rejects.toThrow('holders: scanLimit must be');
		}
		await expect(
			access.holders(team, 'members', { matchesMany: () => [true] }),
		).rejects.toThrow('holders: matchesMany must answer one boolean');
	});

	it('types matchesMany as one boolean per holder and scanLimit as a number', async () => {
		const access = await crowded();
		await access
			.holders(team, 'members', {
				// @ts-expect-error matchesMany answers booleans, not holders
				matchesMany: (batch) => batch,
			})
			.catch(() => undefined);
		await access
			.holders(team, 'members', {
				// @ts-expect-error scanLimit is a number
				scanLimit: '10',
				matches: () => true,
			})
			.catch(() => undefined);
	});
});
