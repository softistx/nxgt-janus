import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { setup, types } from './events.fixtures';

type Auth = ReturnType<typeof setup>['auth'];

/** The two sign-ins by e-mail, each from its request to its answer. */
const flows = {
	async signInCode(auth: Auth) {
		const issued = await auth.signInCode.request(ada.email);
		if (issued === null) throw new Error('expected a code');
		return auth.signInCode.confirm(issued.challenge, issued.code);
	},
	async magicLink(auth: Auth) {
		const issued = await auth.magicLink.request(ada.email);
		if (issued === null) throw new Error('expected a link');
		return auth.magicLink.confirm(issued.token);
	},
};

for (const [name, signInByEmail] of Object.entries(flows)) {
	describe(`${name}.confirm, on an e-mail never proved`, () => {
		it('drops the password and signs out every session opened before', async () => {
			const { auth } = setup();
			// Somebody signs up with Ada's e-mail and a password of their own.
			const squatter = await auth.signUp({ ...ada, password });

			const signedIn = await signInByEmail(auth);
			if (signedIn.status !== 'signedIn') throw new Error('expected a session');

			expect(signedIn.user.emailVerified).toBe(true);
			expect(signedIn.user.hasPassword).toBe(false);
			expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
			expect(
				await rejection(auth.signIn({ email: ada.email, password })),
			).toMatchObject({ code: 'CREDENTIALS_INVALID' });
			expect((await auth.authenticate(bearer(signedIn.token)))?.user.id).toBe(
				signedIn.user.id,
			);
		});

		it('sends user.emailVerified, then user.passwordChanged', async () => {
			const { auth, received } = setup();
			await auth.signUp({ ...ada, password });
			received.length = 0;

			await signInByEmail(auth);

			expect(types(received)).toEqual([
				'user.emailVerified',
				'user.passwordChanged',
			]);
		});

		it('sends no user.passwordChanged for a user who had no password', async () => {
			const { auth, received } = setup();
			await auth.create(ada);
			received.length = 0;

			await signInByEmail(auth);

			expect(types(received)).toEqual(['user.emailVerified']);
		});
	});

	describe(`${name}.confirm, on an e-mail already proved`, () => {
		it('keeps the password and every session, and sends nothing', async () => {
			const { auth, received } = setup();
			const { user, token } = await auth.signUp({ ...ada, password });
			await auth.verifyEmail.confirm((await auth.verifyEmail.send(user)).token);
			received.length = 0;

			const signedIn = await signInByEmail(auth);
			if (signedIn.status !== 'signedIn') throw new Error('expected a session');

			expect(signedIn.user.hasPassword).toBe(true);
			expect((await auth.authenticate(bearer(token)))?.user.id).toBe(user.id);
			expect((await auth.signIn({ email: ada.email, password })).status).toBe(
				'signedIn',
			);
			expect(received).toEqual([]);
		});
	});
}
