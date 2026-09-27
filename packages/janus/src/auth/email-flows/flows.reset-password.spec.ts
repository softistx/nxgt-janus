import { describe, expect, it } from 'bun:test';
import { ada, bearer, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type { JanusError } from '../../errors/janus-error';

describe('resetPassword', () => {
	it('answers null for an e-mail nobody holds — the page must say the same either way', async () => {
		const { auth } = setup();

		expect(await auth.resetPassword.request('nobody@example.test')).toBeNull();
	});

	it('finds the user by the e-mail normalised, and confirming sets the password', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const requested = await auth.resetPassword.request('  ADA@example.test');
		const reset = await auth.resetPassword.confirm(
			requested?.token ?? '',
			'brand new password',
		);

		expect(requested?.user.id).toBe(user.id);
		expect(reset.id).toBe(user.id);
		// The link reached the inbox: that proves the e-mail.
		expect(reset.emailVerified).toBe(true);
		await auth.signIn({ email: ada.email, password: 'brand new password' });
		expect(
			(
				(await rejection(
					auth.signIn({ email: ada.email, password }),
				)) as JanusError
			).code,
		).toBe('CREDENTIALS_INVALID');
	});

	it('signs the user out everywhere, and opens no session', async () => {
		const { auth } = setup();
		const { user, token } = await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);

		await auth.resetPassword.confirm(
			requested?.token ?? '',
			'brand new password',
		);

		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect((await auth.get(user.id)).hasPassword).toBe(true);
	});

	it('refuses a short password before spending the token', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);
		const token = requested?.token ?? '';

		const short = (await rejection(
			auth.resetPassword.confirm(token, 'short'),
		)) as JanusError;

		expect(short.code).toBe('PASSWORD_TOO_SHORT');
		await auth.resetPassword.confirm(token, 'brand new password');
	});

	it('lets exactly one of twenty concurrent redemptions through', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);
		const token = requested?.token ?? '';

		const outcomes = await Promise.all(
			Array.from({ length: 20 }, () =>
				auth.resetPassword.confirm(token, 'brand new password').then(
					() => 'reset',
					(error: JanusError) => error.code,
				),
			),
		);

		expect(outcomes.filter((outcome) => outcome === 'reset')).toHaveLength(1);
		expect(
			outcomes.filter((outcome) => outcome === 'TOKEN_SPENT'),
		).toHaveLength(19);
	});

	it('does not redeem a verification token as a reset token', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);

		const error = (await rejection(
			auth.resetPassword.confirm(sent.token, 'brand new password'),
		)) as JanusError;

		expect(error.code).toBe('TOKEN_UNKNOWN');
		expect((await auth.verifyEmail.confirm(sent.token)).emailVerified).toBe(
			true,
		);
	});
});
