import { describe, expect, it } from 'bun:test';
import { ada, bearer, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import type {
	CredentialError,
	StoreConflict,
	UserInvalidError,
} from '../../errors/janus-error';

describe('signUp', () => {
	it('creates the user, signs them in, and hands the token over once', async () => {
		const { auth, store } = setup();

		const { user, session, token } = await auth.signUp({ ...ada, password });

		expect(user).toMatchObject({
			...ada,
			type: 'user',
			emailVerified: false,
			active: true,
			hasPassword: true,
			version: 0,
		});
		expect(session.userId).toBe(user.id);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		// The store holds the hash, and the user object never carries it.
		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$scrypt$',
		);
		expect(JSON.stringify(user)).not.toContain('$scrypt$');
		expect(await auth.authenticate(bearer(token))).not.toBeNull();
	});

	it('drops an optional field left undefined, so the store holds strict JSON', async () => {
		const { auth, store } = setup();

		const { user } = await auth.signUp({
			...ada,
			nickname: undefined,
			password,
		});

		expect(
			Object.hasOwn(
				(await store.users.findUser(user.id))?.fields ?? {},
				'nickname',
			),
		).toBe(false);
	});

	it('refuses invalid fields field by field, with the paths the schema reported', async () => {
		const { auth } = setup();

		const error = (await rejection(
			auth.signUp({ email: 'not an e-mail', name: 7 as never, password }),
		)) as UserInvalidError;

		expect(error.code).toBe('USER_INVALID');
		expect(error.issues?.map((issue) => issue.path)).toEqual([
			['email'],
			['name'],
		]);
		expect(error.message).not.toContain('not an e-mail');
	});

	it('refuses a short password, reporting the policy and never the password', async () => {
		const { auth } = setup();

		const error = (await rejection(
			auth.signUp({ ...ada, password: 'tiny1' }),
		)) as CredentialError;

		expect(error.code).toBe('PASSWORD_TOO_SHORT');
		expect(error.minLength).toBe(8);
		expect(error.message).not.toContain('tiny1');
	});

	it('refuses a taken login after normalisation: the uniqueness is of bytes', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });

		const error = (await rejection(
			auth.signUp({ ...ada, email: 'ADA@Example.test', password }),
		)) as StoreConflict;

		expect(error.code).toBe('LOGIN_TAKEN');
		expect(error.login).toBe('ada@example.test');
	});
});
