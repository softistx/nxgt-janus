import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { hasher } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { fixedClock } from '../../time/clock';
import type { UserEvent } from '../events';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';
import { hashSecret } from '../secrets';

const Account = z.strictObject({ email: z.email(), name: z.string() });

/** Two types with an e-mail, and a listener that records what it hears. */
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
const MOVED = 'moved@example.test';
const HOUR = 3_600_000;

describe('changeEmail.confirm at the root of several types', () => {
	it('moves an admin whose type the page does not know, verified, with its events', async () => {
		const { auth, received } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		received.length = 0;

		const changed = await auth.changeEmail.confirm(sent.token);

		expect(changed.type).toBe('admin');
		expect(changed.id).toBe(admin.id);
		expect(changed.email).toBe(MOVED);
		expect(changed.emailVerified).toBe(true);
		expect((await auth.admin.get(admin.id)).email).toBe(MOVED);
		expect(received.map((event) => event.type)).toEqual([
			'user.emailChanged',
			'user.emailVerified',
		]);
	});

	it('moves a member through the same root', async () => {
		const { auth } = twoTypes();
		await auth.admin.create(ADMIN);
		const member = await auth.member.create(MEMBER);
		const sent = await auth.member.changeEmail.send(member, MOVED);

		const changed = await auth.changeEmail.confirm(sent.token);

		expect(changed.type).toBe('member');
		expect((await auth.member.get(member.id)).email).toBe(MOVED);
	});

	it('refuses an unknown token, and a second confirmation as spent', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);

		expect(await rejection(auth.changeEmail.confirm('forged'))).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});
		await auth.changeEmail.confirm(sent.token);
		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('is TOKEN_STALE once the e-mail moved since the link was asked', async () => {
		const { auth, store, clock } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		const stored = await store.users.findUser(admin.id);
		await store.users.updateUser(
			admin.id,
			{
				updatedAt: clock.now(),
				fields: { ...stored?.fields, email: 'other@example.test' },
			},
			stored?.version ?? 0,
		);

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_STALE' },
		);
		expect((await auth.admin.get(admin.id)).email).toBe('other@example.test');
	});

	it('leaves a per-type confirmation of another type as it was: TOKEN_UNKNOWN, spent', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		await auth.member.create(MEMBER);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);

		expect(
			await rejection(auth.member.changeEmail.confirm(sent.token)),
		).toMatchObject({ code: 'TOKEN_UNKNOWN' });
		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_SPENT' },
		);
	});

	it('refuses an inactive user with USER_INACTIVE', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		await auth.admin.setActive(admin, false);

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'USER_INACTIVE' },
		);
	});

	it('refuses a lapsed token with TOKEN_EXPIRED', async () => {
		const { auth, clock } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		clock.advance(HOUR);

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_EXPIRED' },
		);
	});

	it('refuses a user deleted since with TOKEN_UNKNOWN', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		await auth.admin.delete(admin);

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'TOKEN_UNKNOWN' },
		);
	});

	it('refuses an address another user of the type took with LOGIN_TAKEN', async () => {
		const { auth } = twoTypes();
		const admin = await auth.admin.create(ADMIN);
		const sent = await auth.admin.changeEmail.send(admin, MOVED);
		await auth.admin.create({ email: MOVED, name: 'Other' });

		expect(await rejection(auth.changeEmail.confirm(sent.token))).toMatchObject(
			{ code: 'LOGIN_TAKEN' },
		);
		expect((await auth.admin.get(admin.id)).email).toBe(ADMIN.email);
	});

	it('refuses a user of a type with no e-mail with TOKEN_UNKNOWN', async () => {
		const { auth, store, clock } = twoTypes();
		const porter = await auth.porter.create({ username: 'porter' });
		// No type without an e-mail has a `send`: the token is put in the store.
		const secret = 'a-token-for-a-porter';
		await store.tokens.insertToken({
			tokenHash: hashSecret(secret),
			kind: 'changeEmail',
			userId: porter.id,
			address: MOVED,
			codeHash: null,
			attempts: 0,
			expiresAt: new Date(clock.now().getTime() + HOUR),
			spentAt: null,
			createdAt: clock.now(),
		});

		expect(await rejection(auth.changeEmail.confirm(secret))).toMatchObject({
			code: 'TOKEN_UNKNOWN',
		});
	});
});
