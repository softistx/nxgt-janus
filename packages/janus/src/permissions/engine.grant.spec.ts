import { describe, expect, it } from 'bun:test';
import { rejection } from '../../test/rejection';
import { patient, record, setup, staff, team } from './engine.fixtures';

describe('grant and revoke', () => {
	it('revokes what was granted, and revoking twice is not an error', async () => {
		const access = setup();
		const ada = staff();
		const t = team();
		await access.grant(t, 'members', ada);
		await access.revoke(t, 'members', ada);
		await access.revoke(t, 'members', ada);

		expect(await access.can(ada, 'members', t)).toBe(false);
	});

	it('treats a user as a user, whatever fields it carries', async () => {
		const access = setup();
		const t = team();
		// A user's fields are flat on it; one named relation is still a field.
		const ada = { ...staff(), relation: 'cousin', name: 'Ada' };
		await access.grant(t, 'members', ada);

		expect(await access.can({ type: 'staff', id: ada.id }, 'members', t)).toBe(
			true,
		);
	});

	const cases: [
		string,
		(access: ReturnType<typeof setup>) => Promise<unknown>,
		string,
	][] = [
		[
			'a relation read from a field',
			(access) => access.grant(record(), 'doctors' as never, staff() as never),
			'is read from doctorId',
		],
		[
			'a holder the relation does not admit',
			(access) => access.grant(team(), 'leads', patient() as never),
			'team.leads is not held by patient',
		],
		[
			'an id the notation would read two ways',
			(access) => access.grant({ type: 'team', id: 't#1' }, 'members', staff()),
			'without @, # or parentheses',
		],
		[
			'an object type the model does not declare',
			(access) =>
				access.grant(
					{ type: 'ward', id: 'w' } as never,
					'members' as never,
					staff() as never,
				),
			'"ward" is not an object type',
		],
		[
			'a permission can() does not know',
			(access) => access.can(staff(), 'edti' as never, team()),
			'"edti" is not a relation or a permission of team',
		],
	];
	for (const [name, call, message] of cases) {
		it(`refuses ${name} with a TypeError`, async () => {
			const error = await rejection(call(setup()));
			expect(error).toBeInstanceOf(TypeError);
			expect((error as Error).message).toContain(message);
		});
	}
});
