import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { permissions } from './engine';
import { ada, setup } from './list.fixtures';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { createMemoryRelations } from './port/memory';

describe('list()', () => {
	it('rejects STORE_FAILED when findObjects cannot answer, and a failing lookup as it failed', async () => {
		const failing = setup({
			...createMemoryRelations(),
			findObjects: async () => {
				throw new Error('primary stepped down');
			},
		});
		const error = (await rejection(failing.list(ada, 'members', 'team'))) as {
			code: string;
		};
		expect(error.code).toBe('STORE_FAILED');

		const outage = new Error('records table unreachable');
		const access = permissions({
			model: defineModel({
				subjects: ['staff'],
				types: {
					record: {
						related: {
							doctors: fromField('doctorId', 'staff', {
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
		expect(await rejection(access.list(ada, 'doctors', 'record'))).toBe(outage);
	});
});
