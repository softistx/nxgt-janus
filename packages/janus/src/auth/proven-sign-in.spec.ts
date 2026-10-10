import { describe, expect, it } from 'bun:test';
import { ada, bearer, clinic, password, setup } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { mintId } from '../ids/id';
import { setup as listening, types } from './events.fixtures';
import type { UserRef } from './types';

describe('signInProven', () => {
	it('signs in by id, and opens a session that authenticates', async () => {
		const { auth } = setup();
		const user = await auth.create(ada);

		const signedIn = await auth.signInProven(user.id);

		expect(signedIn).toMatchObject({
			status: 'signedIn',
			user: { id: user.id },
			newDevice: false,
			deviceToken: null,
		});
		expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
			user.id,
		);
	});

	it('takes the user as well as their id', async () => {
		const { auth } = setup();
		const user = await auth.create(ada);

		expect((await auth.signInProven(user)).user.id).toBe(user.id);
	});

	it('proves no e-mail and writes nothing on the user', async () => {
		const { auth, received } = listening();
		const user = await auth.create(ada);

		const signedIn = await auth.signInProven(user.id);

		expect(signedIn.user.emailVerified).toBe(false);
		expect(signedIn.user.version).toBe(user.version);
		expect(types(received)).toEqual(['user.created']);
	});

	it('refuses an inactive user as every sign-in does, and opens nothing', async () => {
		const { auth, store } = setup();
		const user = await auth.create({ ...ada, password, active: false });

		const refused = await rejection(auth.signInProven(user.id));

		expect(refused).toMatchObject({
			code: 'USER_INACTIVE',
			message: 'signInProven: the user is inactive',
			userId: user.id,
		});
		expect(await store.sessions.revokeUserSessions(user.id, new Date())).toBe(
			0,
		);
	});

	it('refuses a user deactivated after the proof was made', async () => {
		const { auth } = setup();
		const user = await auth.create(ada);
		await auth.setActive(user, false);

		expect(await rejection(auth.signInProven(user.id))).toMatchObject({
			code: 'USER_INACTIVE',
		});
	});

	it('answers NOT_FOUND for a deleted user, as get does', async () => {
		const { auth } = setup();
		const user = await auth.create(ada);
		await auth.delete(user);

		expect(await rejection(auth.signInProven(user.id))).toMatchObject({
			code: 'NOT_FOUND',
			message: 'signInProven: no user has this id',
		});
	});

	it('answers NOT_FOUND for an unknown or malformed id, without a session', async () => {
		const { auth } = setup();
		const ids: unknown[] = [
			mintId(Date.now()),
			'nope',
			'',
			42,
			null,
			{ id: 7 },
		];

		for (const id of ids) {
			expect(await rejection(auth.signInProven(id as UserRef))).toMatchObject({
				code: 'NOT_FOUND',
			});
		}
	});

	it("answers NOT_FOUND for another type's user, naming the type called", async () => {
		const { auth } = clinic();
		const staff = await auth.staff.create({
			username: 'ada',
			service: 'cardiology',
		});

		expect(await rejection(auth.patient.signInProven(staff.id))).toMatchObject({
			code: 'NOT_FOUND',
			message: 'patient.signInProven: no patient has this id',
			userType: 'patient',
		});
		expect((await auth.staff.signInProven(staff.id)).user.type).toBe('staff');
	});

	it('refuses options that are not { device } as a wiring mistake', async () => {
		const { auth } = setup();
		const user = await auth.create(ada);

		expect(
			await rejection(
				auth.signInProven(user.id, 'token' as unknown as { device: null }),
			),
		).toBeInstanceOf(TypeError);
	});
});
