import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { patient, setup, staff, team } from './engine.fixtures';
import { createMemoryRelations } from './port/memory';
import { counting } from './replace.fixtures';

describe('replace refuses and fails', () => {
	const refusals: [string, (subjects: unknown[]) => unknown[], string][] = [
		[
			'a holder the relation does not admit',
			(ok) => [...ok, patient()],
			'team.leads is not held by patient',
		],
		[
			'an id the notation would read two ways',
			(ok) => [...ok, { type: 'staff', id: 'a#1' }],
			'without @, # or parentheses',
		],
		[
			'a subject that is no object',
			(ok) => [...ok, 'ada'],
			'the subject must be a user, or { type, id }',
		],
	];
	for (const [name, subjects, message] of refusals) {
		it(`refuses ${name} anywhere in the list, and writes nothing`, async () => {
			const { access, writes } = counting();
			const t = team();
			await access.grant(t, 'leads', staff());
			writes.length = 0;

			const error = await rejection(
				access.replace(t, 'leads', subjects([staff()]) as never),
			);

			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toContain(message);
			expect(writes).toHaveLength(0);
		});
	}

	it('refuses what grant refuses for the object', async () => {
		const { access, writes } = counting();
		const cases = [
			[{ type: 'ward', id: 'w' }, 'members', '"ward" is not an object type'],
			[{ type: 'team', id: 't#1' }, 'members', 'without @, # or parentheses'],
			[{ type: 'team', id: 'a\0b' }, 'members', 'object id'],
			[{ type: 'record', id: 'r' }, 'doctors', 'is read from doctorId'],
		] as const;
		for (const [object, relation, message] of cases) {
			const error = await rejection(
				access.replace(object as never, relation as never, []),
			);
			expect((error as Error).message).toContain(message);
		}
		expect(writes).toHaveLength(0);
	});

	it('refuses a subjects argument that is not an array', async () => {
		const { access } = counting();
		const error = await rejection(
			access.replace(team(), 'members', staff() as never),
		);
		expect((error as Error).message).toContain('must be an array');
	});

	it('rejects STORE_FAILED when the store cannot write, as grant does', async () => {
		const access = setup({
			...createMemoryRelations(),
			write: async () => {
				throw new Error('primary stepped down');
			},
		});

		const error = (await rejection(
			access.replace(team(), 'members', [staff()]),
		)) as { code: string };

		expect(error.code).toBe('STORE_FAILED');
	});

	for (const method of ['findEntities', 'findSubjectSets'] as const) {
		it(`rejects STORE_FAILED when ${method} cannot answer, and writes nothing`, async () => {
			const { store, writes } = counting();
			const access = setup({
				...store,
				[method]: async () => {
					throw new Error('primary stepped down');
				},
			});

			const error = (await rejection(
				access.replace(team(), 'members', [staff()]),
			)) as { code: string };

			expect(error.code).toBe('STORE_FAILED');
			expect(writes).toHaveLength(0);
		});
	}
});
