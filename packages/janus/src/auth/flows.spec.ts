import { describe, expect, it } from 'bun:test';
import { ada, bearer, password, rejection, setup } from '../../test/auth';
import type { JanusError } from '../errors/janus-error';

const HOUR = 3_600_000;

describe('verifyEmail', () => {
	it('sends a token for the current e-mail, and confirming it verifies the e-mail', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const sent = await auth.verifyEmail.send(user);
		const verified = await auth.verifyEmail.confirm(sent.token);

		expect(sent.email).toBe(ada.email);
		expect(verified.emailVerified).toBe(true);
		// The store holds the hash of the token, never the token.
		expect(JSON.stringify(await store.users.findUser(user.id))).not.toContain(
			sent.token,
		);
	});

	it('refuses a token sent to an e-mail the user no longer has', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);
		await auth.update(user, { email: 'countess@example.test' });

		const error = (await rejection(
			auth.verifyEmail.confirm(sent.token),
		)) as JanusError;

		expect(error.code).toBe('TOKEN_STALE');
		expect((await auth.get(user.id)).emailVerified).toBe(false);
	});

	it('is single use, lapses, and names no secret in any refusal', async () => {
		const { auth, clock } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const used = await auth.verifyEmail.send(user);
		const lapsing = await auth.verifyEmail.send(user);
		await auth.verifyEmail.confirm(used.token);
		clock.advance(24 * HOUR);

		const refusals = [
			(await rejection(auth.verifyEmail.confirm(used.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm(lapsing.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm(lapsing.token))) as JanusError,
			(await rejection(auth.verifyEmail.confirm('forged'))) as JanusError,
		];

		expect(refusals.map((error) => error.code)).toEqual([
			'TOKEN_SPENT',
			'TOKEN_EXPIRED',
			'TOKEN_SPENT',
			'TOKEN_UNKNOWN',
		]);
		for (const error of refusals) {
			expect(error.message).not.toContain(used.token);
			expect(error.message).not.toContain(lapsing.token);
		}
	});
});

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
