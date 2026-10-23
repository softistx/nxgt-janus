import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { bearer, hasher } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import { hashSecret } from '../secrets';
import { changingEmailAfterRedeem } from './changing-email.fixtures';

const Account = z.strictObject({ email: z.email(), name: z.string() });

/**
 * Two types that can reset a password — admins accept 8 characters, members
 * 12 — a type with an e-mail and no password, and a listener.
 */
function threeTypes() {
	const received: UserEvent[] = [];
	const store = createMemoryStores();
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const auth = janus({
		users: {
			admin: { schema: Account, password: { login: 'email' } },
			member: { schema: Account, password: { login: 'email', minLength: 12 } },
			guest: { schema: z.strictObject({ email: z.email() }) },
		},
		store,
		hasher,
		clock,
		events: (event) => void received.push(event),
	});
	return { auth, store, clock, received };
}

const ADMIN = { email: 'admin@example.test', name: 'Ada' };
const MEMBER = { email: 'member@example.test', name: 'Max' };
const OLD = 'old password';
const LONG_OLD = 'old password of a member';
const FRESH = 'a brand new password';
const EIGHT = 'eight!!!';
const TEN = 'ten chars!';
const HOUR = 3_600_000;

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
