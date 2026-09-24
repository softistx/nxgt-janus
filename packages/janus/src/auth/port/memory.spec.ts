import { describe, expect, it } from 'bun:test';
import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import { mintId } from '../../ids/id';
import { createMemoryStores } from './memory';
import type { SessionRecord, TokenRecord, UserRecord } from './types';

// These specs pin the reference store's own behaviour. The conformance suite,
// in `src/conformance/`, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

const at = (ms: number) => new Date(ms);

function user(overrides: Partial<UserRecord> = {}): UserRecord {
	return {
		id: mintId(),
		type: 'user',
		schemaVersion: '1',
		active: true,
		fields: { email: 'a@b.test', name: { first: 'Ada', last: 'L' } },
		logins: ['a@b.test'],
		password: { hash: '$argon2id$v=19$…', updatedAt: at(1) },
		emailVerifiedAt: null,
		version: 0,
		createdAt: at(1),
		updatedAt: at(1),
		...overrides,
	};
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: mintId(),
		tokenHash: crypto.randomUUID(),
		userId: mintId(),
		authenticatedAt: at(1),
		expiresAt: at(1000),
		revokedAt: null,
		createdAt: at(1),
		...overrides,
	};
}

function token(overrides: Partial<TokenRecord> = {}): TokenRecord {
	return {
		tokenHash: crypto.randomUUID(),
		kind: 'resetPassword',
		userId: mintId(),
		address: 'a@b.test',
		expiresAt: at(1000),
		spentAt: null,
		createdAt: at(1),
		...overrides,
	};
}

/** Settles a rejection where it is created, per AGENTS.md. */
const rejection = (promise: Promise<unknown>): Promise<unknown> =>
	promise.then(
		() => {
			throw new Error('expected a rejection');
		},
		(error: unknown) => error,
	);

describe('users', () => {
	it('round-trips a record byte for byte, a number staying a number', async () => {
		const { users } = createMemoryStores();
		const record = user({ fields: { email: 'a@b.test', age: 1 } });

		await users.insertUser(record);

		expect(await users.findUser(record.id)).toEqual(record);
		expect((await users.findUserByLogin('user', 'a@b.test'))?.fields.age).toBe(
			1,
		);
	});

	it('answers null for an absence, never undefined', async () => {
		const { users } = createMemoryStores();

		expect(await users.findUser(mintId())).toBeNull();
		expect(await users.findUserByLogin('user', 'nobody@b.test')).toBeNull();
	});

	it('copies in and out, so a caller mutating a record cannot reach the store', async () => {
		const { users } = createMemoryStores();
		const record = user();
		const inserted = await users.insertUser(record);

		(record.fields as Record<string, unknown>).email = 'mutated-before';
		(inserted.fields as Record<string, unknown>).email = 'mutated-after';

		expect((await users.findUser(record.id))?.fields.email).toBe('a@b.test');
	});

	it('compares logins as bytes, and within one type', async () => {
		// Normalisation is the core's, before the store sees a value.
		const { users } = createMemoryStores();
		await users.insertUser(user());

		expect(await users.findUserByLogin('user', 'A@B.test')).toBeNull();
		expect(await users.findUserByLogin('staff', 'a@b.test')).toBeNull();
	});

	it('is idempotent under retry: the same id answers the stored record', async () => {
		const { users } = createMemoryStores();
		const record = user();

		await users.insertUser(record);
		const retried = await users.insertUser({
			...record,
			fields: { email: 'different@b.test' },
		});

		expect(retried).toEqual(record);
	});

	it('refuses a login another user of the type holds, and writes nothing', async () => {
		const { users } = createMemoryStores();
		await users.insertUser(user());
		const second = user();

		const error = await rejection(users.insertUser(second));

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('LOGIN_TAKEN');
		expect((error as StoreConflict).login).toBe('a@b.test');
		expect(await users.findUser(second.id)).toBeNull();
	});

	it('lets the same login be held once per type', async () => {
		const { users } = createMemoryStores();
		await users.insertUser(user());
		const staff = user({ type: 'staff' });

		await users.insertUser(staff);

		expect((await users.findUserByLogin('staff', 'a@b.test'))?.id).toBe(
			staff.id,
		);
	});

	it('lets exactly one of twenty concurrent sign-ups hold a login', async () => {
		const { users } = createMemoryStores();

		const outcomes = await Promise.allSettled(
			Array.from({ length: 20 }, () => users.insertUser(user())),
		);

		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
		expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(19);
	});

	it('pages one type in id order with no gap, and ends on a null cursor', async () => {
		const { users } = createMemoryStores();
		const ids: string[] = [];
		for (let i = 0; i < 25; i += 1) ids.push(mintId());
		// Inserted out of order, so the Map's insertion order is not the answer.
		for (const id of [...ids].reverse()) {
			await users.insertUser(user({ id, logins: [id] }));
		}
		await users.insertUser(user({ type: 'staff', logins: ['staff'] }));

		const seen: string[] = [];
		let after: string | null = null;
		let pages = 0;
		do {
			const page = await users.listUsers({ type: 'user', after, limit: 10 });
			seen.push(...page.items.map((item) => item.id));
			after = page.nextCursor;
			pages += 1;
		} while (after !== null);

		expect(pages).toBe(3);
		expect(seen).toEqual([...ids].sort());
	});

	it('answers an empty page for an empty store, never null', async () => {
		const { users } = createMemoryStores();

		expect(
			await users.listUsers({ type: 'user', after: null, limit: 10 }),
		).toEqual({ items: [], nextCursor: null });
	});

	it('leaves what a patch does not name exactly as it was', async () => {
		// The Kratos `PUT` trap: an update that omits `state` deactivates the
		// account, one that omits a trait deletes it. Here, omission is "keep".
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const written = await users.updateUser(
			record.id,
			{ updatedAt: at(2), emailVerifiedAt: at(2) },
			0,
		);

		expect(written).toEqual({
			...record,
			emailVerifiedAt: at(2),
			version: 1,
			updatedAt: at(2),
		});
	});

	it('treats a key present as undefined as absent, never as an erasure', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		// Only JavaScript can send this: the package is compiled with
		// `exactOptionalPropertyTypes`, and `test/types/port.ts` holds the refusal.
		const patch = { updatedAt: at(2), active: undefined, password: undefined };
		const written = await users.updateUser(
			record.id,
			patch as unknown as { updatedAt: Date },
			0,
		);

		expect(written.active).toBe(true);
		expect(written.password).toEqual(record.password);
	});

	it('ignores a key the port does not declare, such as version or type', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const written = await users.updateUser(
			record.id,
			{ updatedAt: at(2), version: 99, id: 'x', type: 'staff' } as unknown as {
				updatedAt: Date;
			},
			0,
		);

		expect(written.version).toBe(1);
		expect(written.id).toBe(record.id);
		expect(written.type).toBe('user');
	});

	it('removes the password on null, and keeps it when the patch does not name it', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		const kept = await users.updateUser(record.id, { updatedAt: at(2) }, 0);
		expect(kept.password).toEqual(record.password);

		const removed = await users.updateUser(
			record.id,
			{ updatedAt: at(3), password: null },
			1,
		);
		expect(removed.password).toBeNull();
	});

	it('refuses a stale version, reports both, and leaves the record identical', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);
		await users.updateUser(record.id, { updatedAt: at(2), active: false }, 0);
		const before = await users.findUser(record.id);

		const error = await rejection(
			users.updateUser(record.id, { updatedAt: at(3), active: true }, 0),
		);

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('VERSION_CONFLICT');
		expect((error as StoreConflict).expectedVersion).toBe(0);
		expect((error as StoreConflict).actualVersion).toBe(1);
		expect(await users.findUser(record.id)).toEqual(before);
	});

	it('tells an unknown id from a stale version', async () => {
		const { users } = createMemoryStores();

		const error = await rejection(
			users.updateUser(mintId(), { updatedAt: at(2) }, 0),
		);

		expect(error).toBeInstanceOf(NotFoundError);
		expect((error as NotFoundError).code).toBe('NOT_FOUND');
	});

	it('moves a login on update, freeing the old one', async () => {
		const { users } = createMemoryStores();
		const record = user();
		await users.insertUser(record);

		await users.updateUser(
			record.id,
			{ updatedAt: at(2), logins: ['new@b.test'] },
			0,
		);

		expect(await users.findUserByLogin('user', 'a@b.test')).toBeNull();
		expect((await users.findUserByLogin('user', 'new@b.test'))?.id).toBe(
			record.id,
		);
		// The freed login is available to somebody else.
		await users.insertUser(user());
	});

	it('refuses an update onto a held login, and writes nothing', async () => {
		const { users } = createMemoryStores();
		const first = user();
		const second = user({ logins: ['b@b.test'] });
		await users.insertUser(first);
		await users.insertUser(second);

		const error = await rejection(
			users.updateUser(
				second.id,
				{ updatedAt: at(2), logins: ['a@b.test'] },
				0,
			),
		);

		expect((error as StoreConflict).code).toBe('LOGIN_TAKEN');
		expect(await users.findUser(second.id)).toEqual(second);
	});
});

describe('sessions', () => {
	it('answers a lapsed or revoked session verbatim: expiry is the core’s decision', async () => {
		const { sessions } = createMemoryStores();
		const record = session({ expiresAt: at(5), revokedAt: at(4) });
		await sessions.insertSession(record);

		expect(await sessions.findSessionByTokenHash(record.tokenHash)).toEqual(
			record,
		);
		expect(await sessions.findSessionByTokenHash('unknown')).toBeNull();
	});

	it('extends a standing session, and never brings a revoked one back', async () => {
		const { sessions } = createMemoryStores();
		const standing = session();
		const revoked = session({ revokedAt: at(2) });
		await sessions.insertSession(standing);
		await sessions.insertSession(revoked);

		expect(
			(await sessions.extendSession(standing.id, at(2000)))?.expiresAt,
		).toEqual(at(2000));
		expect(await sessions.extendSession(revoked.id, at(2000))).toBeNull();
		expect(await sessions.extendSession(mintId(), at(2000))).toBeNull();
	});

	it('revokes once, keeps the first revokedAt, and says false only for no session', async () => {
		const { sessions } = createMemoryStores();
		const record = session();
		await sessions.insertSession(record);

		expect(await sessions.revokeSession(record.id, at(2))).toBe(true);
		expect(await sessions.revokeSession(record.id, at(3))).toBe(true);
		expect(
			(await sessions.findSessionByTokenHash(record.tokenHash))?.revokedAt,
		).toEqual(at(2));
		expect(await sessions.revokeSession(mintId(), at(3))).toBe(false);
	});

	it('signs out everywhere else, and counts only what this call revoked', async () => {
		const { sessions } = createMemoryStores();
		const userId = mintId();
		const current = session({ userId });
		const other = session({ userId });
		const already = session({ userId, revokedAt: at(1) });
		const stranger = session();
		for (const record of [current, other, already, stranger]) {
			await sessions.insertSession(record);
		}

		expect(await sessions.revokeUserSessions(userId, at(2), current.id)).toBe(
			1,
		);
		expect(
			(await sessions.findSessionByTokenHash(current.tokenHash))?.revokedAt,
		).toBeNull();
		expect(
			(await sessions.findSessionByTokenHash(stranger.tokenHash))?.revokedAt,
		).toBeNull();
		expect(await sessions.revokeUserSessions(userId, at(3))).toBe(1);
	});

	it('collects sessions at or before the instant, and only those', async () => {
		const { sessions } = createMemoryStores();
		const lapsed = session({ expiresAt: at(10) });
		const living = session({ expiresAt: at(11) });
		await sessions.insertSession(lapsed);
		await sessions.insertSession(living);

		expect(await sessions.deleteExpiredSessions?.(at(10))).toBe(1);
		expect(await sessions.findSessionByTokenHash(lapsed.tokenHash)).toBeNull();
		expect(await sessions.findSessionByTokenHash(living.tokenHash)).toEqual(
			living,
		);
	});
});

describe('tokens', () => {
	it('lets exactly one of twenty concurrent redemptions spend a token', async () => {
		// A reset token two requests both redeem is an account takeover.
		const { tokens } = createMemoryStores();
		const record = token();
		await tokens.insertToken(record);

		const answers = await Promise.all(
			Array.from({ length: 20 }, () =>
				tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
			),
		);

		expect(
			answers.filter((a) => a !== null && a.spentAt === null),
		).toHaveLength(1);
		expect(answers.filter((a) => a?.spentAt !== null)).toHaveLength(19);
	});

	it('answers the token as it was before the call', async () => {
		const { tokens } = createMemoryStores();
		const record = token();
		await tokens.insertToken(record);

		expect(
			await tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
		).toEqual(record);
		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(3)))
				?.spentAt,
		).toEqual(at(2));
	});

	it('spends a lapsed token all the same: expiry is compared by the core', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ expiresAt: at(1) });
		await tokens.insertToken(record);

		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(5)))
				?.spentAt,
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'resetPassword', at(6)))
				?.spentAt,
		).toEqual(at(5));
	});

	it('does not know, and does not spend, a token of the other kind', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ kind: 'verifyEmail' });
		await tokens.insertToken(record);

		expect(
			await tokens.consumeToken(record.tokenHash, 'resetPassword', at(2)),
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'verifyEmail', at(3)))
				?.spentAt,
		).toBeNull();
		expect(
			await tokens.consumeToken('unknown', 'resetPassword', at(3)),
		).toBeNull();
	});
});
