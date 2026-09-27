import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { ada, setup } from './list.fixtures';
import { createMemoryRelations } from './port/memory';

describe('list()', () => {
	it('throws PERMISSION_DEPTH past maxDepth, and answers within it', async () => {
		const store = createMemoryRelations();
		const deep = setup(store, 20);
		const folder = (n: number) => ({
			type: 'folder' as const,
			id: `f${String(n).padStart(2, '0')}`,
		});
		await deep.grant(folder(0), 'owners', ada);
		for (let n = 1; n < 12; n += 1) {
			await deep.grant(folder(n), 'parents', folder(n - 1));
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
});
