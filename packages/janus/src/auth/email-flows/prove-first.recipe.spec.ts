import { describe, expect, it } from 'bun:test';
import { ada, bearer } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { listening, squatted } from './prove-first.fixtures';

const chosen = 'the invitee chose this';

/**
 * Accepting an invitation to an address somebody else signed up with: the
 * order the guides give — find or create, prove the e-mail, set the
 * password, sign in — and the order that loses the password.
 */
describe('the invitation recipe, around verifyEmail.proveFirst', () => {
	it('findByEmail, proveFirst, setPassword, signInProven: the new password works, one session lives', async () => {
		const { auth } = listening();
		const squatter = await squatted(auth);

		const user =
			(await auth.findByEmail(ada.email)) ?? (await auth.create(ada));
		await auth.verifyEmail.proveFirst(user);
		await auth.setPassword(user, chosen);
		const signedIn = await auth.signInProven(user);
		if (signedIn.status !== 'signedIn') throw new Error('expected a session');

		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
		expect(
			(await auth.authenticate(bearer(signedIn.token)))?.user,
		).toMatchObject({ id: user.id, emailVerified: true, hasPassword: true });
		const byPassword = await auth.signIn({
			email: ada.email,
			password: chosen,
		});
		expect(byPassword.status).toBe('signedIn');
		// Revoking all but the new sign-in's session finds exactly one other:
		// the recipe's own. The squatter's was revoked already.
		const except =
			byPassword.status === 'signedIn' ? byPassword.session.id : '';
		expect(await auth.signOutEverywhere(user, { except })).toBe(1);
	});

	it('creates the user when nobody holds the address, and proves it', async () => {
		const { auth, types } = listening();

		const user =
			(await auth.findByEmail(ada.email)) ?? (await auth.create(ada));
		const first = await auth.verifyEmail.proveFirst(user);
		await auth.setPassword(first.user, chosen);

		expect(first.proved).toBe(true);
		expect(types()).toEqual([
			'user.created',
			'user.emailVerified',
			'user.passwordChanged',
		]);
		expect(
			(await auth.signIn({ email: ada.email, password: chosen })).status,
		).toBe('signedIn');
	});

	it('proveFirst after setPassword erases the new password', async () => {
		const { auth } = listening();
		const { user } = await squatted(auth);

		await auth.setPassword(user, chosen);
		await auth.verifyEmail.proveFirst(user);

		expect(
			await rejection(auth.signIn({ email: ada.email, password: chosen })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID', reason: 'noPassword' });
	});

	it('proveFirst after signInProven revokes the session just opened', async () => {
		const { auth } = listening();
		const { user } = await squatted(auth);

		const signedIn = await auth.signInProven(user);
		if (signedIn.status !== 'signedIn') throw new Error('expected a session');
		await auth.verifyEmail.proveFirst(user);

		expect(await auth.authenticate(bearer(signedIn.token))).toBeNull();
	});
});
