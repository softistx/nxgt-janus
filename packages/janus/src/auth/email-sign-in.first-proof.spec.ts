import { describe, expect, it } from 'bun:test';
import { ada, bearer, hasher, password, person } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { fixedClock } from '../time/clock';
import { setup, types } from './events.fixtures';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import { codeAt, fromBase32, stepAt } from './totp';

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

describe('a first proof by e-mail, and a second factor', () => {
	it('spends the challenge a password sign-in left waiting, and still asks for the factor', async () => {
		const clock = fixedClock(Date.UTC(2026, 8, 28));
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher,
			clock,
			secondFactor: {
				issuer: 'Clinic',
				keys: [{ id: 'k1', key: Buffer.alloc(32, 1).toString('base64') }],
			},
		});
		const { user } = await auth.signUp({ ...ada, password });
		const { secret } = await auth.secondFactor.enroll(user);
		await auth.secondFactor.activate(
			user,
			codeAt(fromBase32(secret), stepAt(clock.now())),
		);
		const waiting = await auth.signIn({ email: ada.email, password });
		if (waiting.status !== 'secondFactor') throw new Error('expected a factor');
		const issued = await auth.magicLink.request(ada.email);

		const result = await auth.magicLink.confirm(issued?.token ?? '');

		// The factor is not dropped: the application disables it, if it must.
		expect(result.status).toBe('secondFactor');
		clock.advance(30_000);
		const code = codeAt(fromBase32(secret), stepAt(clock.now()));
		expect(
			await rejection(auth.secondFactor.confirm(waiting.challenge, code)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});
});
