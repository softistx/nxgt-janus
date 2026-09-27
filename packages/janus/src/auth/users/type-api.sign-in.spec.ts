import { describe, expect, it } from 'bun:test';
import { ada, hasher, password, rejection, setup } from '../../../test/auth';
import type { CredentialError, JanusError } from '../../errors/janus-error';

describe('signIn', () => {
	it('signs in with the login normalised as sign-up normalised it', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const signedIn = await auth.signIn({ email: 'ADA@Example.test', password });

		expect(signedIn.user.id).toBe(user.id);
		expect(signedIn.session.userId).toBe(user.id);
	});

	it('answers one code for an unknown login, no password and a wrong one — the reason is for logs', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const bare = await auth.create({
			email: 'bare@example.test',
			name: 'Bare',
		});

		const reasons = [];
		for (const attempt of [
			{ email: 'nobody@example.test', password },
			{ email: bare.email, password },
			{ email: ada.email, password: 'wrong password' },
		]) {
			const error = (await rejection(auth.signIn(attempt))) as CredentialError;
			expect(error.code).toBe('CREDENTIALS_INVALID');
			expect(error.message).toBe(
				'signIn: the login and the password do not match',
			);
			reasons.push(error.reason);
		}

		expect(reasons).toEqual(['unknownLogin', 'noPassword', 'wrongPassword']);
	});

	it('still hashes when nobody holds the login, so the time does not say so', async () => {
		let verified = 0;
		const counting = {
			...hasher,
			verify: async (plain: string, hash: string) => {
				verified += 1;
				return hasher.verify(plain, hash);
			},
		};
		const { janus } = await import('../janus');
		const { createMemoryStores } = await import('../port/memory');
		const { person } = await import('../../../test/auth');
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: createMemoryStores(),
			hasher: counting,
		});

		await rejection(auth.signIn({ email: 'nobody@example.test', password }));

		expect(verified).toBe(1);
	});

	it('tells an inactive user so only once they gave the right password', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.setActive(user, false);

		const wrong = (await rejection(
			auth.signIn({ email: ada.email, password: 'wrong password' }),
		)) as JanusError;
		const right = (await rejection(
			auth.signIn({ email: ada.email, password }),
		)) as JanusError;

		expect(wrong.code).toBe('CREDENTIALS_INVALID');
		expect(right.code).toBe('USER_INACTIVE');
	});

	it('refuses a hash no wired verifier claims, reporting the prefix and never the hash', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const record = await store.users.findUser(user.id);
		await store.users.updateUser(
			user.id,
			{
				updatedAt: new Date(),
				password: { hash: '$bcrypt$sentinel-hash', updatedAt: new Date() },
			},
			record?.version ?? 0,
		);

		const error = (await rejection(
			auth.signIn({ email: ada.email, password }),
		)) as CredentialError;

		expect(error.code).toBe('HASH_UNSUPPORTED');
		expect(error.hashPrefix).toBe('$bcrypt$');
		expect(error.message).not.toContain('sentinel');
	});
});
