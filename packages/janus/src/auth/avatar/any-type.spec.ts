import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { several } from './avatar.fixtures';

describe('avatar at the root of several user types', () => {
	it('sets and removes for each type, from the id alone', async () => {
		const { auth, received } = several();
		const patient = await auth.patient.create({
			email: 'p@example.test',
			name: 'Pat',
		});
		const staff = await auth.staff.create({ username: 'sam' });

		const setPatient = await auth.avatar.set(patient.id, { id: 'p-1' });
		const setStaff = await auth.avatar.set(staff, { id: 's-1' });

		expect(setPatient.type).toBe('patient');
		expect(setStaff.type).toBe('staff');
		expect((await auth.patient.get(patient.id)).avatar?.id).toBe('p-1');
		expect((await auth.staff.get(staff.id)).avatar?.id).toBe('s-1');
		expect(
			received
				.filter((e) => e.type === 'user.avatarChanged')
				.map((e) => [e.userType, e.formerAvatarId]),
		).toEqual([
			['patient', null],
			['staff', null],
		]);

		const removed = await auth.avatar.remove(staff);
		expect(removed.type).toBe('staff');
		expect(removed.avatar).toBeNull();
		expect(received.at(-1)).toMatchObject({
			type: 'user.avatarRemoved',
			userType: 'staff',
			formerAvatarId: 's-1',
		});
	});

	it('keeps the no-op and the refusals of the type', async () => {
		const { auth, received } = several();
		const patient = await auth.patient.create({
			email: 'p@example.test',
			name: 'Pat',
		});
		const set = await auth.avatar.set(patient, { id: 'p-1' });
		const events = received.length;

		expect(await auth.avatar.set(patient, { id: 'p-1' })).toEqual(set);
		expect(received).toHaveLength(events);
		expect(await rejection(auth.avatar.set(patient, { id: '' }))).toMatchObject(
			{
				code: 'AVATAR_ID_INVALID',
			},
		);
		expect(
			await rejection(
				auth.avatar.set(patient, { id: 'p-2' }, { ifVersion: 99 }),
			),
		).toMatchObject({ code: 'VERSION_CONFLICT' });
	});

	it('is NOT_FOUND for a user of no type, naming the operation', async () => {
		const { auth } = several();

		const error = await rejection(
			auth.avatar.set('0199a0db-f800-7000-8000-000000000002', { id: 'x' }),
		);

		expect(error).toMatchObject({ code: 'NOT_FOUND', operation: 'avatar.set' });
	});

	it('is NOT_FOUND for a record of a type this configuration does not declare, writing nothing', async () => {
		const { auth, received, store } = several();
		const at = new Date('2026-01-01T00:00:00.000Z');
		const id = '0199a0db-f800-7000-8000-000000000003';
		await store.users.insertUser({
			id,
			type: 'retired',
			schemaVersion: '1',
			active: true,
			fields: { name: 'Old' },
			logins: [],
			password: null,
			secondFactor: null,
			avatar: null,
			emailVerifiedAt: null,
			version: 0,
			createdAt: at,
			updatedAt: at,
		});

		const error = await rejection(auth.avatar.set(id, { id: 'x' }));
		const removed = await rejection(auth.avatar.remove(id));

		expect(error).toMatchObject({ code: 'NOT_FOUND', operation: 'avatar.set' });
		expect(removed).toMatchObject({
			code: 'NOT_FOUND',
			operation: 'avatar.remove',
		});
		expect(await store.users.findUser(id)).toMatchObject({
			avatar: null,
			version: 0,
		});
		expect(received).toHaveLength(0);
	});

	it('names a type as the single-type form does not: avatar is the root only', () => {
		const { auth } = several();

		expect(Object.keys(auth.patient.avatar).sort()).toEqual(['remove', 'set']);
		expect(Object.keys(auth.avatar).sort()).toEqual(['remove', 'set']);
	});
});
