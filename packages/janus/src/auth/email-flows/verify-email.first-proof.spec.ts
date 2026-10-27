import { describe, expect, it } from 'bun:test';
import { ada, bearer, hasher, password, person } from '../../../test/auth';
import { changingEmailAfterRedeem } from '../../../test/changing-email';
import { rejection } from '../../../test/rejection';
import { enrolled, setup } from '../../../test/second-factor';
import type { UserEvent } from '../events';
import { janus } from '../janus';
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
		const received: UserEvent[] = [];
		const context = setup({ events: (event) => void received.push(event) });
		const types = () => received.map((event) => event.type);
		const { auth } = context;
		const { user } = await enrolled(context);
		const link = await auth.verifyEmail.send(user);
		received.length = 0;

		const confirmed = await auth.verifyEmail.confirm(link.token, {
			firstProof: true,
		});

		expect(confirmed.hasSecondFactor).toBe(false);
		expect(types()).toEqual([
			'user.emailVerified',
			'user.passwordChanged',
			'user.secondFactorDisabled',
		]);
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
		const { auth, received, types } = listening();
		const { user, token } = await squatted(auth);
		const link = await auth.verifyEmail.send(user);
		await auth.update(user.id, { email: 'other@example.com' });
		received.length = 0;

		expect(
			await rejection(
				auth.verifyEmail.confirm(link.token, { firstProof: true }),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
		// Refused before the proof: nothing was dropped, no session revoked.
		expect(await auth.authenticate(bearer(token))).not.toBeNull();
		expect((await auth.get(user.id)).hasPassword).toBe(true);
		expect(types()).toEqual([]);
	});

	it('is VERSION_CONFLICT, proving nothing, when the user is written between the read and the proof', async () => {
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: changingEmailAfterRedeem('other@example.com'),
			hasher,
		});
		const { user } = await squatted(auth);
		const link = await auth.verifyEmail.send(user);

		expect(
			await rejection(
				auth.verifyEmail.confirm(link.token, { firstProof: true }),
			),
		).toMatchObject({ code: 'VERSION_CONFLICT' });
		const after = await auth.get(user.id);
		expect(after.emailVerified).toBe(false);
		expect(after.hasPassword).toBe(true);
	});
});
