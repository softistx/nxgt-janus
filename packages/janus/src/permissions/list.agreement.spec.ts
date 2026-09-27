import { describe, expect, it } from 'bun:test';
import { everyPage, randomGraph } from './list.fixtures';

describe('list() is can() over every object', () => {
	const seeds = Array.from({ length: 40 }, (_, n) => n + 1);

	for (const seed of seeds) {
		it(`agrees with can() on random graph ${seed}`, async () => {
			const { rows, access, clean, subjects, questions } =
				await randomGraph(seed);

			for (const onShift of [true, false]) {
				const ctx = { onShift };
				for (const subject of subjects) {
					for (const [type, objects, names] of questions) {
						for (const name of names) {
							const expected: string[] = [];
							for (const id of objects) {
								const object = { type, id, ...rows.get(id) };
								const granted = await access.can(
									subject,
									name as never,
									object as never,
									{ ctx } as never,
								);
								expect(granted).toBe(
									await clean.can(
										subject,
										name as never,
										object as never,
										{ ctx } as never,
									),
								);
								if (granted) expected.push(id);
							}
							const listed = await everyPage((after) =>
								access.list(subject, name as never, type, {
									ctx,
									after,
									limit: 2,
								} as never),
							);
							expect({ subject, name, type, ids: listed }).toEqual({
								subject,
								name,
								type,
								ids: expected,
							});
						}
					}
				}
			}
		});
	}
});
