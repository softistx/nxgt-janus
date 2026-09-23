import { describe, expect, it } from 'bun:test';
import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import { mintIdentityId } from '../../ids/identity-id';
import { createMemoryStores } from './memory';
import type { IdentityRecord, SessionRecord, TokenRecord } from './types';

// These specs pin the reference store's own behaviour. The conformance suite,
// which arrives next, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

const at = (ms: number) => new Date(ms);

function identity(overrides: Partial<IdentityRecord> = {}): IdentityRecord {
	return {
		id: mintIdentityId(),
		schemaVersion: '1',
		state: 'active',
		traits: { email: 'a@b.test', name: { first: 'Ada', last: 'L' } },
		identifiers: [{ type: 'password', value: 'a@b.test' }],
		credentials: {
			password: { hash: '$argon2id$v=19$…', updatedAt: at(1) },
		},
		addresses: [
			{ value: 'a@b.test', via: 'email', verified: false, verifiedAt: null },
		],
		metadataPublic: {},
		metadataAdmin: {},
		version: 0,
		createdAt: at(1),
		updatedAt: at(1),
		...overrides,
	};
}

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: mintIdentityId(),
		tokenHash: crypto.randomUUID(),
		identityId: mintIdentityId(),
		aal: 'aal1',
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
		kind: 'recovery',
		identityId: mintIdentityId(),
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

describe('identities', () => {
	it('round-trips a record byte for byte, a number staying a number', async () => {
		const { identities } = createMemoryStores();
		const record = identity({ traits: { email: 'a@b.test', age: 1 } });

		await identities.insertIdentity(record);

		expect(await identities.findIdentity(record.id)).toEqual(record);
		const found = await identities.findIdentityByIdentifier(
			'password',
			'a@b.test',
		);
		expect(found?.traits.age).toBe(1);
	});

	it('answers null for an absence, never undefined', async () => {
		const { identities } = createMemoryStores();

		expect(await identities.findIdentity(mintIdentityId())).toBeNull();
		expect(
			await identities.findIdentityByIdentifier('password', 'nobody@b.test'),
		).toBeNull();
	});

	it('copies in and out, so a caller mutating a record cannot reach the store', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		const inserted = await identities.insertIdentity(record);

		(record.traits as Record<string, unknown>).email = 'mutated-before';
		(inserted.traits as Record<string, unknown>).email = 'mutated-after';

		expect((await identities.findIdentity(record.id))?.traits.email).toBe(
			'a@b.test',
		);
	});

	it('compares identifiers as bytes: no case folding in the store', async () => {
		// Normalisation is the core's, before the store sees a value.
		const { identities } = createMemoryStores();
		await identities.insertIdentity(identity());

		expect(
			await identities.findIdentityByIdentifier('password', 'A@B.test'),
		).toBeNull();
		expect(
			await identities.findIdentityByIdentifier('code', 'a@b.test'),
		).toBeNull();
	});

	it('is idempotent under retry: the same id answers the stored record', async () => {
		const { identities } = createMemoryStores();
		const record = identity();

		await identities.insertIdentity(record);
		const retried = await identities.insertIdentity({
			...record,
			traits: { email: 'different@b.test' },
		});

		expect(retried).toEqual(record);
	});

	it('refuses an identifier another identity holds, and writes nothing', async () => {
		const { identities } = createMemoryStores();
		await identities.insertIdentity(identity());
		const second = identity();

		const error = await rejection(identities.insertIdentity(second));

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('IDENTIFIER_TAKEN');
		expect((error as StoreConflict).identifier).toBe('a@b.test');
		expect(await identities.findIdentity(second.id)).toBeNull();
	});

	it('lets exactly one of twenty concurrent sign-ups hold an identifier', async () => {
		const { identities } = createMemoryStores();

		const outcomes = await Promise.allSettled(
			Array.from({ length: 20 }, () => identities.insertIdentity(identity())),
		);

		expect(outcomes.filter((o) => o.status === 'fulfilled')).toHaveLength(1);
		expect(outcomes.filter((o) => o.status === 'rejected')).toHaveLength(19);
	});

	it('pages in id order with no gap, and ends on a null cursor', async () => {
		const { identities } = createMemoryStores();
		const ids: string[] = [];
		for (let i = 0; i < 25; i += 1) {
			const record = identity({
				identifiers: [{ type: 'password', value: `u${i}@b.test` }],
			});
			ids.push(record.id);
		}
		// Inserted out of order, so the Map's insertion order is not the answer.
		for (const id of [...ids].reverse()) {
			await identities.insertIdentity(
				identity({ id, identifiers: [{ type: 'password', value: id }] }),
			);
		}

		const seen: string[] = [];
		let after: string | null = null;
		let pages = 0;
		do {
			const page = await identities.listIdentities({ after, limit: 10 });
			seen.push(...page.items.map((item) => item.id));
			after = page.nextCursor;
			pages += 1;
		} while (after !== null);

		expect(pages).toBe(3);
		expect(seen).toEqual([...ids].sort());
	});

	it('answers an empty page for an empty store, never null', async () => {
		const { identities } = createMemoryStores();

		expect(await identities.listIdentities({ after: null, limit: 10 })).toEqual(
			{ items: [], nextCursor: null },
		);
	});

	it('leaves what a patch does not name exactly as it was', async () => {
		// The Kratos `PUT` trap: an update that omits `state` deactivates the
		// account, one that omits a trait deletes it. Here, omission is "keep".
		const { identities } = createMemoryStores();
		const record = identity({
			state: 'active',
			metadataAdmin: { plan: 'pro' },
		});
		await identities.insertIdentity(record);

		const written = await identities.updateIdentity(
			record.id,
			{ updatedAt: at(2), metadataPublic: { theme: 'dark' } },
			0,
		);

		expect(written).toEqual({
			...record,
			metadataPublic: { theme: 'dark' },
			version: 1,
			updatedAt: at(2),
		});
	});

	it('treats a key present as undefined as absent, never as an erasure', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		await identities.insertIdentity(record);

		// Only JavaScript can send this: the package is compiled with
		// `exactOptionalPropertyTypes`, and `test/types/port.ts` holds the refusal.
		const patch = { updatedAt: at(2), state: undefined, traits: undefined };
		const written = await identities.updateIdentity(
			record.id,
			patch as unknown as { updatedAt: Date },
			0,
		);

		expect(written.state).toBe('active');
		expect(written.traits).toEqual(record.traits);
	});

	it('ignores a key the port does not declare, such as version', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		await identities.insertIdentity(record);

		const written = await identities.updateIdentity(
			record.id,
			{ updatedAt: at(2), version: 99, id: 'x' } as unknown as {
				updatedAt: Date;
			},
			0,
		);

		expect(written.version).toBe(1);
		expect(written.id).toBe(record.id);
	});

	it('patches credentials slot by slot: null removes, absence keeps', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		await identities.insertIdentity(record);

		const kept = await identities.updateIdentity(
			record.id,
			{ updatedAt: at(2), credentials: {} },
			0,
		);
		expect(kept.credentials.password).toEqual(record.credentials.password);

		const removed = await identities.updateIdentity(
			record.id,
			{ updatedAt: at(3), credentials: { password: null } },
			1,
		);
		expect(removed.credentials.password).toBeNull();
	});

	it('refuses a stale version, reports both, and leaves the record identical', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		await identities.insertIdentity(record);
		await identities.updateIdentity(
			record.id,
			{ updatedAt: at(2), state: 'inactive' },
			0,
		);
		const before = await identities.findIdentity(record.id);

		const error = await rejection(
			identities.updateIdentity(
				record.id,
				{ updatedAt: at(3), state: 'active' },
				0,
			),
		);

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('VERSION_CONFLICT');
		expect((error as StoreConflict).expectedVersion).toBe(0);
		expect((error as StoreConflict).actualVersion).toBe(1);
		expect(await identities.findIdentity(record.id)).toEqual(before);
	});

	it('tells an unknown id from a stale version', async () => {
		const { identities } = createMemoryStores();

		const error = await rejection(
			identities.updateIdentity(mintIdentityId(), { updatedAt: at(2) }, 0),
		);

		expect(error).toBeInstanceOf(NotFoundError);
		expect((error as NotFoundError).code).toBe('NOT_FOUND');
	});

	it('moves an identifier on update, freeing the old one', async () => {
		const { identities } = createMemoryStores();
		const record = identity();
		await identities.insertIdentity(record);

		await identities.updateIdentity(
			record.id,
			{
				updatedAt: at(2),
				identifiers: [{ type: 'password', value: 'new@b.test' }],
			},
			0,
		);

		expect(
			await identities.findIdentityByIdentifier('password', 'a@b.test'),
		).toBeNull();
		expect(
			(await identities.findIdentityByIdentifier('password', 'new@b.test'))?.id,
		).toBe(record.id);
		// The freed identifier is available to somebody else.
		await identities.insertIdentity(identity());
	});

	it('refuses an update onto a held identifier, and writes nothing', async () => {
		const { identities } = createMemoryStores();
		const first = identity();
		const second = identity({
			identifiers: [{ type: 'password', value: 'b@b.test' }],
		});
		await identities.insertIdentity(first);
		await identities.insertIdentity(second);

		const error = await rejection(
			identities.updateIdentity(
				second.id,
				{
					updatedAt: at(2),
					identifiers: [{ type: 'password', value: 'a@b.test' }],
				},
				0,
			),
		);

		expect((error as StoreConflict).code).toBe('IDENTIFIER_TAKEN');
		expect(await identities.findIdentity(second.id)).toEqual(second);
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
		expect(await sessions.extendSession(mintIdentityId(), at(2000))).toBeNull();
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
		expect(await sessions.revokeSession(mintIdentityId(), at(3))).toBe(false);
	});

	it('signs out everywhere else, and counts only what this call revoked', async () => {
		const { sessions } = createMemoryStores();
		const identityId = mintIdentityId();
		const current = session({ identityId });
		const other = session({ identityId });
		const already = session({ identityId, revokedAt: at(1) });
		const stranger = session();
		for (const record of [current, other, already, stranger]) {
			await sessions.insertSession(record);
		}

		expect(
			await sessions.revokeIdentitySessions(identityId, at(2), current.id),
		).toBe(1);
		expect(
			(await sessions.findSessionByTokenHash(current.tokenHash))?.revokedAt,
		).toBeNull();
		expect(
			(await sessions.findSessionByTokenHash(stranger.tokenHash))?.revokedAt,
		).toBeNull();
		expect(await sessions.revokeIdentitySessions(identityId, at(3))).toBe(1);
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
		// A recovery code two requests both redeem is an account takeover.
		const { tokens } = createMemoryStores();
		const record = token();
		await tokens.insertToken(record);

		const answers = await Promise.all(
			Array.from({ length: 20 }, () =>
				tokens.consumeToken(record.tokenHash, 'recovery', at(2)),
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
			await tokens.consumeToken(record.tokenHash, 'recovery', at(2)),
		).toEqual(record);
		expect(
			(await tokens.consumeToken(record.tokenHash, 'recovery', at(3)))?.spentAt,
		).toEqual(at(2));
	});

	it('spends a lapsed token all the same: expiry is compared by the core', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ expiresAt: at(1) });
		await tokens.insertToken(record);

		expect(
			(await tokens.consumeToken(record.tokenHash, 'recovery', at(5)))?.spentAt,
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'recovery', at(6)))?.spentAt,
		).toEqual(at(5));
	});

	it('does not know, and does not spend, a token of the other kind', async () => {
		const { tokens } = createMemoryStores();
		const record = token({ kind: 'verification' });
		await tokens.insertToken(record);

		expect(
			await tokens.consumeToken(record.tokenHash, 'recovery', at(2)),
		).toBeNull();
		expect(
			(await tokens.consumeToken(record.tokenHash, 'verification', at(3)))
				?.spentAt,
		).toBeNull();
		expect(await tokens.consumeToken('unknown', 'recovery', at(3))).toBeNull();
	});
});
