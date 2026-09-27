import { describe, expect, it } from 'bun:test';
import { permissions } from './engine';
import { ada, modelOver } from './list.fixtures';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { createMemoryRelations } from './port/memory';
import type { RelationStore } from './port/types';

describe('list()', () => {
	it('leaves out an id a lookup answers that no store can keep, as can() holds it by nobody', async () => {
		const access = permissions({
			model: defineModel({
				subjects: ['staff'],
				types: {
					record: {
						related: {
							doctors: fromField('doctorId', 'staff', {
								lookup: async () => ['r\u0000', 'ok', '\uD800'],
							}),
						},
					},
				},
			}),
			store: createMemoryRelations(),
		});

		expect(await access.list(ada, 'doctors', 'record')).toEqual({
			items: ['ok'],
			nextCursor: null,
		});
		expect(
			await access.can(ada, 'doctors', {
				type: 'record',
				id: 'r\u0000',
				doctorId: ada.id,
			}),
		).toBe(false);
	});

	it('follows no arrow through a field holding an id no store can keep', async () => {
		const asked: string[] = [];
		const store = createMemoryRelations();
		const access = permissions({
			model: modelOver(new Map()),
			// Each method records its call: the engine reads them once, when
			// permissions() is called.
			store: new Proxy(store, {
				get: (target, method) => {
					const read = target[method as keyof RelationStore];
					if (typeof read !== 'function') return read;
					return (...args: unknown[]) => {
						asked.push(String(method));
						return Reflect.apply(read, target, args);
					};
				},
			}),
		});

		expect(
			await access.can(ada, 'view', {
				type: 'note',
				id: 'n1',
				teamId: 't\u0000',
			}),
		).toBe(false);
		expect(asked).toEqual([]);
	});
});
