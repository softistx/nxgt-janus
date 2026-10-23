import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import {
	Account,
	ADMIN,
	EIGHT,
	FRESH,
	LONG_OLD,
	MEMBER,
	OLD,
	TEN,
	threeTypes,
} from './reset-password.any-type.fixtures';

describe('resetPassword.confirm at the root of several types', () => {
	it('refuses a password below the strictest minLength before spending the token', async () => {
		const { auth } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		await auth.member.signUp({ ...MEMBER, password: LONG_OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		const token = requested?.token ?? '';

		expect(
			await rejection(auth.resetPassword.confirm(token, EIGHT)),
		).toMatchObject({
			code: 'PASSWORD_TOO_SHORT',
			minLength: 12,
			userType: 'member',
		});
		// The link is still good.
		const reset = await auth.resetPassword.confirm(token, FRESH);
		expect(reset.type).toBe('admin');
	});

	it('refuses at the root what the lenient type accepts through its own confirm', async () => {
		const { auth } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		await auth.member.signUp({ ...MEMBER, password: LONG_OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		const token = requested?.token ?? '';

		expect(
			await rejection(auth.resetPassword.confirm(token, TEN)),
		).toMatchObject({ code: 'PASSWORD_TOO_SHORT' });
		const reset = await auth.admin.resetPassword.confirm(token, TEN);

		expect(reset.type).toBe('admin');
		await auth.admin.signIn({ email: ADMIN.email, password: TEN });
	});

	it('counts a password type with no e-mail: its minLength binds the root, and the admin keeps the link', async () => {
		const auth = janus({
			users: {
				admin: { schema: Account, password: { login: 'email' } },
				staff: {
					schema: z.strictObject({ username: z.string() }),
					password: { login: 'username', minLength: 20 },
				},
			},
			store: createMemoryStores(),
			hasher,
		});
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		const token = requested?.token ?? '';

		expect(
			await rejection(auth.resetPassword.confirm(token, 'twelve chars')),
		).toMatchObject({
			code: 'PASSWORD_TOO_SHORT',
			minLength: 20,
			userType: 'staff',
		});
		const reset = await auth.resetPassword.confirm(
			token,
			'a password of twenty chars',
		);
		expect(reset.type).toBe('admin');
	});

	it('answers TOKEN_UNKNOWN, not a wiring error, when no type has a password and no hasher is wired', async () => {
		const auth = janus({
			users: {
				guest: { schema: z.strictObject({ email: z.email() }) },
				visitor: { schema: z.strictObject({ email: z.email() }) },
			},
			store: createMemoryStores(),
		});

		// Not in the types, since no type can reset: a JavaScript caller's view.
		const root = Reflect.get(auth, 'resetPassword');
		const confirm = Reflect.get(root, 'confirm');

		expect(
			await rejection(Reflect.apply(confirm, root, ['forged', FRESH])),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});
});
