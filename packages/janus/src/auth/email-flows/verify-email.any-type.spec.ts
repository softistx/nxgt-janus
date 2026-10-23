import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import { hashSecret } from '../secrets';
import { changingEmailAfterRedeem } from './changing-email.fixtures';

const Account = z.strictObject({ email: z.email(), name: z.string() });

/** Two types with an e-mail, one without, and a listener that records what it hears. */
function twoTypes() {
	const received: UserEvent[] = [];
	const store = createMemoryStores();
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const auth = janus({
		users: {
			admin: { schema: Account, password: { login: 'email' } },
			member: { schema: Account, password: { login: 'email' } },
			porter: { schema: z.strictObject({ username: z.string() }) },
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
const HOUR = 3_600_000;

describe('verifyEmail.confirm at the root of several types', () => {
	it('verifies an admin whose type the page does not know, with its event', async () => {
		const { auth, received } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);
		received.length = 0;

		const verified = await auth.verifyEmail.confirm(sent.token);

		expect(verified.type).toBe('admin');
		expect(verified.id).toBe(admin.id);
		expect(verified.emailVerified).toBe(true);
		expect((await auth.admin.get(admin.id)).emailVerified).toBe(true);
		expect(received.map((event) => event.type)).toEqual(['user.emailVerified']);
	});

	it('verifies a member through the same root', async () => {
		const { auth } = twoTypes();
		await auth.admin.create(ADMIN);
		const member = await auth.member.create(MEMBER);
		const sent = await auth.member.verifyEmail.send(member);

		const verified = await auth.verifyEmail.confirm(sent.token);

		expect(verified.type).toBe('member');
		expect((await auth.member.get(member.id)).emailVerified).toBe(true);
	});

	it('sends the event once: a second link for a verified e-mail sends none', async () => {
		const { auth, received } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const first = await auth.admin.verifyEmail.send(admin);
		const second = await auth.admin.verifyEmail.send(admin);
		await auth.verifyEmail.confirm(first.token);
		received.length = 0;

		const again = await auth.verifyEmail.confirm(second.token);

		expect(again.emailVerified).toBe(true);
		expect(received).toEqual([]);
	});

	it('refuses an unknown token, and a second confirmation as spent', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);

		expect(await rejection(auth.verifyEmail.confirm('forged'))).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});
		await auth.verifyEmail.confirm(sent.token);
		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('refuses a lapsed token with TOKEN_EXPIRED', async () => {
		const { auth, clock } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);
		clock.advance(24 * HOUR);

		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_EXPIRED' },
		);
	});

	it('refuses a user deleted since with TOKEN_UNKNOWN', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);
		await auth.admin.delete(admin);

		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_UNKNOWN' },
		);
	});

	it('is TOKEN_STALE once the e-mail moved since the link was sent', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);
		await auth.admin.update(admin, { email: 'other@example.test' });

		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.admin.get(admin.id)).emailVerified).toBe(false);
	});

	it('leaves a per-type confirmation of another type as it was: TOKEN_UNKNOWN, spent', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		await auth.member.create(MEMBER);
		const sent = await auth.admin.verifyEmail.send(admin);

		expect(
			await rejection(auth.member.verifyEmail.confirm(sent.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('refuses a user of a type with no e-mail with TOKEN_UNKNOWN', async () => {
		const { auth, store, clock } = twoTypes();
		const porter = await auth.porter.create({ username: 'porter' });
		// No type without an e-mail has a `send`: the token is put in the store.
		const secret = 'a-token-for-a-porter';
		await store.tokens.insertToken({
			tokenHash: hashSecret(secret),
			kind: 'verifyEmail',
			userId: porter.id,
			address: 'porter@example.test',
			codeHash: null,
			attempts: 0,
			expiresAt: new Date(clock.now().getTime() + HOUR),
			spentAt: null,
			createdAt: clock.now(),
		});

		expect(await rejection(auth.verifyEmail.confirm(secret))).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});
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
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.verifyEmail.send(admin);

		expect(await rejection(auth.verifyEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.admin.get(admin.id)).emailVerified).toBe(false);
	});

	it('does not redeem a reset token, and that token still works afterwards', async () => {
		const { auth } = twoTypes();
		await auth.admin.signUp({ ...ADMIN, password: 'a long password' });
		const reset = await auth.admin.resetPassword.request(ADMIN.email);

		expect(
			await rejection(auth.verifyEmail.confirm(reset?.token ?? '')),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		const done = await auth.resetPassword.confirm(
			reset?.token ?? '',
			'another long password',
		);
		expect(done.type).toBe('admin');
	});
});
