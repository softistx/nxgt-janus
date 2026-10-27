import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { enrolled, setup } from '../../../test/second-factor';
import { listening, squatted } from './prove-first.fixtures';

describe('verifyEmail.confirm with { firstProof: true }, on an e-mail never proved', () => {
	it('drops the squatter password and revokes their sessions', async () => {
		const { auth, types, received } = listening();
		const squatter = await squatted(auth);
		const link = await auth.verifyEmail.send(squatter.user);
		received.length = 0;

		const user = await auth.verifyEmail.confirm(link.token, {
			firstProof: true,
		});

		expect(user).toMatchObject({ emailVerified: true, hasPassword: false });
		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
		expect(
			await rejection(auth.signIn({ email: ada.email, password })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'noPassword' });
		expect(types()).toEqual(['user.emailVerified', 'user.passwordChanged']);
	});

	it('keeps the password without the option, as before', async () => {
		const { auth } = listening();
		const squatter = await squatted(auth);
		const link = await auth.verifyEmail.send(squatter.user);

		await auth.verifyEmail.confirm(link.token);

		expect((await auth.signIn({ email: ada.email, password })).status).toBe(
			'signedIn',
		);
	});

	it('drops the second factor too (a factor enrolled before the proof)', async () => {
		const context = setup();
		const { auth } = context;
		const { user } = await enrolled(context);
		const link = await auth.verifyEmail.send(user);

		const confirmed = await auth.verifyEmail.confirm(link.token, {
			firstProof: true,
		});

		expect(confirmed.hasSecondFactor).toBe(false);
		expect(await auth.secondFactor.recoveryCodesLeft(user)).toBeNull();
	});

	it('changes nothing for an e-mail already proved', async () => {
		const { auth, received } = listening();
		const { user, token } = await auth.signUp({ ...ada, password });
		await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
		received.length = 0;

		const second = await auth.verifyEmail.confirm(
			(await auth.verifyEmail.send(user)).token,
			{ firstProof: true },
		);

		expect(second.hasPassword).toBe(true);
		expect((await auth.authenticate(bearer(token)))?.user.id).toBe(user.id);
		expect(received).toEqual([]);
	});

	it('refuses a token sent to an address since changed', async () => {
		const { auth } = listening();
		const { user } = await squatted(auth);
		const link = await auth.verifyEmail.send(user);
		await auth.update(user.id, { email: 'other@example.com' });

		expect(
			await rejection(
				auth.verifyEmail.confirm(link.token, { firstProof: true }),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
	});
});
