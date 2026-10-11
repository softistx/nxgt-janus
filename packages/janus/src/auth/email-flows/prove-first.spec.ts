import { describe, expect, it } from 'bun:test';
import { ada, bearer, clinic, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { mintId } from '../../ids/id';
import type { UserRef } from '../types';
import { listening, squatted } from './prove-first.fixtures';

describe('verifyEmail.proveFirst, on an e-mail never proved', () => {
	it('marks it verified, drops the password and revokes every session', async () => {
		const { auth } = listening();
		const squatter = await squatted(auth);

		const first = await auth.verifyEmail.proveFirst(squatter.user.id);

		expect(first.proved).toBe(true);
		expect(first.user).toMatchObject({
			id: squatter.user.id,
			emailVerified: true,
			hasPassword: false,
			hasSecondFactor: false,
		});
		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'noPassword' });
	});

	it('sends user.emailVerified, then user.passwordChanged', async () => {
		const { auth, received, types } = listening();
		const { user } = await squatted(auth);
		received.length = 0;

		await auth.verifyEmail.proveFirst(user);

		expect(types()).toEqual(['user.emailVerified', 'user.passwordChanged']);
	});

	it('sends user.emailVerified alone for a user who had no password', async () => {
		const { auth, received, types } = listening();
		const user = await auth.create(ada);
		received.length = 0;

		expect((await auth.verifyEmail.proveFirst(user)).proved).toBe(true);
		expect(types()).toEqual(['user.emailVerified']);
	});

	it('spends the reset links the password opened', async () => {
		const { auth } = listening();
		const { user } = await squatted(auth);
		const reset = await auth.resetPassword.request(ada.email);
		if (reset === null) throw new Error('expected a link');

		await auth.verifyEmail.proveFirst(user);

		expect(
			await rejection(auth.resetPassword.confirm(reset.token, 'another one')),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});
});

describe('verifyEmail.proveFirst, on an e-mail already proved', () => {
	it('changes nothing, sends nothing, and answers proved: false', async () => {
		const { auth, received } = listening();
		const { user, token } = await auth.signUp({ ...ada, password });
		await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
		const before = await auth.get(user.id);
		received.length = 0;

		const first = await auth.verifyEmail.proveFirst(user);

		expect(first).toEqual({ user: before, proved: false });
		expect((await auth.authenticate(bearer(token)))?.user.id).toBe(user.id);
		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'signedIn',
		);
		expect(received).toEqual([]);
	});

	it('is a no-op the second time: the first call proved the e-mail', async () => {
		const { auth, types } = listening();
		const { user } = await squatted(auth);

		expect((await auth.verifyEmail.proveFirst(user)).proved).toBe(true);
		const second = await auth.verifyEmail.proveFirst(user);

		expect(second.proved).toBe(false);
		expect(second.user.emailVerified).toBe(true);
		expect(
			types().filter((type) => type === 'user.emailVerified'),
		).toHaveLength(1);
	});
});

describe('verifyEmail.proveFirst refuses', () => {
	it('an inactive user with USER_INACTIVE, and proves nothing', async () => {
		const { auth } = setup();
		const user = await auth.create({ ...ada, password, active: false });

		expect(await rejection(auth.verifyEmail.proveFirst(user))).toMatchObject({
			code: 'USER_INACTIVE',
			message: 'verifyEmail.proveFirst: the user is inactive',
			userId: user.id,
		});
		expect(await auth.get(user.id)).toMatchObject({
			emailVerified: false,
			hasPassword: true,
		});
	});

	it('an unknown, deleted or malformed id with NOT_FOUND', async () => {
		const { auth } = setup();
		const gone = await auth.create(ada);
		await auth.delete(gone);
		const ids: unknown[] = [
			gone.id,
			mintId(Date.now()),
			'nope',
			'',
			42,
			null,
			{ id: 7 },
		];

		for (const id of ids) {
			expect(
				await rejection(auth.verifyEmail.proveFirst(id as UserRef)),
			).toMatchObject({ code: 'NOT_FOUND' });
		}
		expect(await rejection(auth.verifyEmail.proveFirst(gone.id))).toMatchObject(
			{
				message: 'verifyEmail.proveFirst: no user has this id',
			},
		);
	});

	it("another type's user with NOT_FOUND, naming the type called", async () => {
		const { auth } = clinic();
		const patient = await auth.patient.signUp({
			email: ada.email,
			birthDate: '1815-12-10',
			password,
		});
		const staff = await auth.staff.create({
			username: 'ada',
			service: 'cardiology',
		});

		expect(
			await rejection(auth.patient.verifyEmail.proveFirst(staff.id)),
		).toMatchObject({
			code: 'NOT_FOUND',
			message: 'patient.verifyEmail.proveFirst: no patient has this id',
			userType: 'patient',
		});
		expect(
			(await auth.patient.verifyEmail.proveFirst(patient.user)).proved,
		).toBe(true);
	});
});
