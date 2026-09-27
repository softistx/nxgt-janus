import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { permissions } from './engine';
import { ada, setup } from './list.fixtures';
import { defineModel } from './model/define';
import { fromField } from './model/from-field';
import { when } from './model/when';
import { createMemoryRelations } from './port/memory';

describe('list()', () => {
	const unreversible = defineModel({
		subjects: ['staff'],
		types: {
			record: {
				related: {
					doctors: fromField('doctorId', 'staff'),
					viewers: ['staff'],
				},
				permits: {
					view: ['viewers', 'doctors'],
					edit: [when('viewers', (ctx: { onShift: boolean }) => ctx.onShift)],
				},
			},
		},
	});
	const cases: [string, () => Promise<unknown>, string][] = [
		[
			'a fromField with no lookup',
			() =>
				permissions({
					model: unreversible,
					store: createMemoryRelations(),
				}).list(ada, 'view' as never, 'record'),
			// The subject's type, never its id.
			"list: record.doctors is read from a field, and has no lookup to find the records naming a subject of type 'staff' — fromField('doctorId', 'staff', { lookup })",
		],
		[
			'a condition with no ctx',
			() =>
				permissions({
					model: unreversible,
					store: createMemoryRelations(),
				}).list(ada, 'edit', 'record', {} as never),
			'record.edit reaches a condition, and no ctx was passed',
		],
		[
			'a type the model does not declare',
			() => setup().list(ada, 'view' as never, 'ward' as never),
			'"ward" is not an object type',
		],
		[
			'a name the type does not declare',
			() => setup().list(ada, 'edti' as never, 'team'),
			'"edti" is not a relation or a permission of team',
		],
		[
			'a limit under 1',
			() => setup().list(ada, 'members', 'team', { limit: 0 }),
			'limit must be an integer',
		],
	];
	for (const [name, call, message] of cases) {
		it(`refuses ${name} with a TypeError`, async () => {
			const error = await rejection(call());
			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toContain(message);
		});
	}
});
