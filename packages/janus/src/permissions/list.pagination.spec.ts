import { describe, expect, it } from 'bun:test';
import { ada, everyPage, setup } from './list.fixtures';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

describe('list()', () => {
	it('pages in ascending id order, from a cursor that need not name an object', async () => {
		const access = setup();
		for (const id of ['t3', 't1', 't4', 't2']) {
			await access.grant({ type: 'team', id }, 'members', ada);
		}

		expect(await access.list(ada, 'members', 'team', { limit: 3 })).toEqual({
			items: ['t1', 't2', 't3'],
			nextCursor: 't3',
		});
		expect(await access.list(ada, 'members', 'team', { after: 't3' })).toEqual({
			items: ['t4'],
			nextCursor: null,
		});
		expect(
			await access.list(ada, 'members', 'team', { after: 't2x', limit: 1 }),
		).toEqual({ items: ['t3'], nextCursor: 't3' });
		expect(await access.list(ada, 'leads', 'team')).toEqual({
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
			await access.grant({ type: 'team', id }, 'members', ada);
		}

		const listed = await everyPage((after) =>
			access.list(ada, 'members', 'team', { after, limit: 100 }),
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
});
