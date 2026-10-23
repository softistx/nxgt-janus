import { describe, expect, it } from 'bun:test';
import { bearer, hasher } from '../../../test/auth';
import { changingEmailAfterRedeem } from '../../../test/changing-email';
import { rejection } from '../../../test/rejection';
import { janus } from '../janus';
import { hashSecret } from '../secrets';
import {
	Account,
	ADMIN,
	FRESH,
	HOUR,
	LONG_OLD,
	MEMBER,
	OLD,
	threeTypes,
} from './reset-password.any-type.fixtures';

describe('resetPassword.confirm at the root of several types', () => {
	it('resets an admin whose type the page does not know, and signs them out', async () => {
		const { auth, received } = threeTypes();
		const { user, token } = await auth.admin.signUp({
			...ADMIN,
			password: OLD,
		});
		await auth.member.signUp({ ...MEMBER, password: LONG_OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		received.length = 0;

		const reset = await auth.resetPassword.confirm(
			requested?.token ?? '',
			FRESH,
		);

		expect(reset.type).toBe('admin');
		expect(reset.id).toBe(user.id);
		expect(reset.emailVerified).toBe(true);
		await auth.admin.signIn({ email: ADMIN.email, password: FRESH });
		expect(
			await rejection(auth.admin.signIn({ email: ADMIN.email, password: OLD })),
		).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(received.map((event) => event.type)).toEqual([
			'user.passwordReset',
			'user.emailVerified',
		]);
	});

	it('resets a member through the same root', async () => {
		const { auth } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		const { user } = await auth.member.signUp({
			...MEMBER,
			password: LONG_OLD,
		});
		const requested = await auth.member.resetPassword.request(MEMBER.email);

		const reset = await auth.resetPassword.confirm(
			requested?.token ?? '',
			FRESH,
		);

		expect(reset.type).toBe('member');
		expect(reset.id).toBe(user.id);
		await auth.member.signIn({ email: MEMBER.email, password: FRESH });
	});

	it('refuses an unknown token, and a second confirmation as spent', async () => {
		const { auth } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		const token = requested?.token ?? '';

		expect(
			await rejection(auth.resetPassword.confirm('forged', FRESH)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		await auth.resetPassword.confirm(token, FRESH);
		expect(
			await rejection(auth.resetPassword.confirm(token, FRESH)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses a lapsed token with TOKEN_EXPIRED', async () => {
		const { auth, clock } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		clock.advance(24 * HOUR);

		expect(
			await rejection(
				auth.resetPassword.confirm(requested?.token ?? '', FRESH),
			),
		).toMatchObject({ code: 'TOKEN_EXPIRED' });
	});

	it('refuses a user deleted since with TOKEN_UNKNOWN', async () => {
		const { auth } = threeTypes();
		const { user } = await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		await auth.admin.delete(user);

		expect(
			await rejection(
				auth.resetPassword.confirm(requested?.token ?? '', FRESH),
			),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('is TOKEN_STALE once the e-mail moved since the link was sent', async () => {
		const { auth } = threeTypes();
		const { user } = await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		await auth.admin.update(user, { email: 'other@example.test' });

		expect(
			await rejection(
				auth.resetPassword.confirm(requested?.token ?? '', FRESH),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
	});

	it('leaves a per-type confirmation of another type as it was: TOKEN_UNKNOWN, spent', async () => {
		const { auth } = threeTypes();
		await auth.admin.signUp({ ...ADMIN, password: OLD });
		await auth.member.signUp({ ...MEMBER, password: LONG_OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);
		const token = requested?.token ?? '';

		expect(
			await rejection(auth.member.resetPassword.confirm(token, FRESH)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(
			await rejection(auth.resetPassword.confirm(token, FRESH)),
		).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('refuses a user of a type with no password with TOKEN_UNKNOWN', async () => {
		const { auth, store, clock } = threeTypes();
		const guest = await auth.guest.create({ email: 'guest@example.test' });
		// No type without a password has a reset to ask: the token is put in the store.
		const secret = 'a-token-for-a-guest';
		await store.tokens.insertToken({
			tokenHash: hashSecret(secret),
			kind: 'resetPassword',
			userId: guest.id,
			address: 'guest@example.test',
			codeHash: null,
			attempts: 0,
			expiresAt: new Date(clock.now().getTime() + HOUR),
			spentAt: null,
			createdAt: clock.now(),
		});

		expect(
			await rejection(auth.resetPassword.confirm(secret, FRESH)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
	});

	it('is TOKEN_STALE when the e-mail moves between the read and the write', async () => {
		const store = changingEmailAfterRedeem('other@example.test');
		const auth = janus({
			users: {
				admin: { schema: Account, password: { login: 'email' } },
				member: { schema: Account, password: { login: 'email' } },
			},
			store,
			hasher,
		});
		const { user } = await auth.admin.signUp({ ...ADMIN, password: OLD });
		const requested = await auth.admin.resetPassword.request(ADMIN.email);

		expect(
			await rejection(
				auth.resetPassword.confirm(requested?.token ?? '', FRESH),
			),
		).toMatchObject({ code: 'TOKEN_STALE' });
		await auth.admin.signIn({ email: 'other@example.test', password: OLD });
		expect((await auth.admin.get(user.id)).email).toBe('other@example.test');
	});

	it('does not redeem a verification token, and that token still works afterwards', async () => {
		const { auth } = threeTypes();
		const { user } = await auth.admin.signUp({ ...ADMIN, password: OLD });
		const sent = await auth.admin.verifyEmail.send(user);

		expect(
			await rejection(auth.resetPassword.confirm(sent.token, FRESH)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect((await auth.verifyEmail.confirm(sent.token)).emailVerified).toBe(
			true,
		);
	});
});
