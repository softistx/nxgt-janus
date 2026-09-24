import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, definition, rejection, setup } from '../../test/identities';
import {
	CredentialError,
	InvalidCursorError,
	NotFoundError,
	StoreConflict,
	TraitsInvalidError,
} from '../errors/janus-error';
import { isIdentityId, mintIdentityId } from '../ids/identity-id';
import { createIdentities } from './create';
import { defineIdentities } from './define';
import { createMemoryStores } from './port/memory';

describe('create', () => {
	it('validates, derives identifiers and addresses, and hides the credentials', async () => {
		const { identities, stores } = setup();

		const identity = await identities.create({
			traits: { ...ada, email: 'Ada@Example.test' },
			password: 'correct horse',
		});

		expect(isIdentityId(identity.id)).toBe(true);
		expect(identity.version).toBe(0);
		expect(identity.identifiers).toEqual([
			{ type: 'password', value: 'ada@example.test' },
			{ type: 'code', value: 'ada@example.test' },
		]);
		// The address is the trait as written: normalisation is the identifiers'.
		expect(identity.addresses).toEqual([
			{
				value: 'Ada@Example.test',
				via: 'email',
				verified: false,
				verifiedAt: null,
			},
		]);
		expect(identity.hasPassword).toBe(true);
		expect('credentials' in identity).toBe(false);

		const stored = await stores.identities.findIdentity(identity.id);
		expect(stored?.credentials.password?.hash.startsWith('$scrypt$')).toBe(
			true,
		);
	});

	it('drops an optional trait left undefined, so the store holds strict JSON', async () => {
		const { identities, stores } = setup();

		const identity = await identities.create({
			traits: { ...ada, nickname: undefined },
		});

		const stored = await stores.identities.findIdentity(identity.id);
		expect(stored?.traits).toEqual(ada);
		expect(Object.hasOwn(stored?.traits ?? {}, 'nickname')).toBe(false);
	});

	it('refuses invalid traits field by field, with the paths the schema reported', async () => {
		const { identities } = setup();

		const error = await rejection(
			identities.create({
				traits: {
					email: 'not-an-email',
					name: { first: 'A', last: 1 },
				} as never,
			}),
		);

		expect(error).toBeInstanceOf(TraitsInvalidError);
		const paths = (error as TraitsInvalidError).issues?.map((i) => i.path);
		expect(paths).toContainEqual(['email']);
		expect(paths).toContainEqual(['name', 'last']);
	});

	it('refuses a short password, reporting the policy and never the password', async () => {
		const { identities } = setup();

		const error = await rejection(
			identities.create({ traits: ada, password: 'sentine' }),
		);

		expect(error).toBeInstanceOf(CredentialError);
		expect((error as CredentialError).code).toBe('PASSWORD_TOO_SHORT');
		expect((error as CredentialError).minLength).toBe(8);
		expect((error as Error).message).not.toContain('sentine');
	});

	it('refuses a taken identifier after normalisation: the uniqueness is of bytes', async () => {
		const { identities } = setup();
		await identities.create({ traits: ada });

		const error = await rejection(
			identities.create({ traits: { ...ada, email: 'ADA@example.test' } }),
		);

		expect(error).toBeInstanceOf(StoreConflict);
		expect((error as StoreConflict).code).toBe('IDENTIFIER_TAKEN');
	});
});

describe('reading', () => {
	it('answers null for an absence, and a malformed id never reaches the store', async () => {
		let reached = 0;
		const stores = createMemoryStores();
		const findIdentity = stores.identities.findIdentity;
		const counting = {
			...stores,
			identities: {
				...stores.identities,
				findIdentity: (id: string) => {
					reached += 1;
					return findIdentity(id);
				},
			},
		};
		const { identities } = setup({ stores: counting });

		expect(await identities.find('../../etc/passwd')).toBeNull();
		expect(reached).toBe(0);
		expect(await identities.find(mintIdentityId())).toBeNull();
		expect(reached).toBe(1);
	});

	it('turns an absence into NOT_FOUND only on get', async () => {
		const { identities } = setup();

		const error = await rejection(identities.get(mintIdentityId()));

		expect(error).toBeInstanceOf(NotFoundError);
	});

	it('finds by identifier through the same normalisation as sign-up', async () => {
		const { identities } = setup();
		const created = await identities.create({ traits: ada });

		expect(
			(await identities.findByIdentifier('password', ' ADA@example.test'))?.id,
		).toBe(created.id);
	});

	it('pages in creation order, and refuses a cursor it did not mint', async () => {
		const { identities, clock } = setup();
		const ids: string[] = [];
		for (let i = 0; i < 25; i += 1) {
			clock.advance(1);
			ids.push(
				(await identities.create({ traits: { ...ada, email: `u${i}@x.test` } }))
					.id,
			);
		}

		const seen: string[] = [];
		let after: string | null = null;
		do {
			const page = await identities.list({ after, limit: 10 });
			seen.push(...page.items.map((identity) => identity.id));
			after = page.nextCursor;
		} while (after !== null);
		expect(seen).toEqual(ids);

		const error = await rejection(identities.list({ after: 'page-2' }));
		expect(error).toBeInstanceOf(InvalidCursorError);
	});
});

describe('writing', () => {
	it('replaces traits whole, moves identifiers, and keeps an unchanged address verified', async () => {
		const { identities } = setup();
		const created = await identities.create({ traits: ada });
		await identities.setAddressVerified(created.id, ada.email, true);

		const renamed = await identities.updateTraits(created.id, {
			...ada,
			name: { first: 'Augusta', last: 'King' },
		});

		expect(renamed.traits.name.first).toBe('Augusta');
		expect(renamed.addresses[0]?.verified).toBe(true);
		expect(renamed.version).toBe(2);

		const moved = await identities.updateTraits(created.id, {
			...ada,
			email: 'augusta@example.test',
		});
		expect(moved.addresses).toEqual([
			{
				value: 'augusta@example.test',
				via: 'email',
				verified: false,
				verifiedAt: null,
			},
		]);
		expect(await identities.findByIdentifier('password', ada.email)).toBeNull();
	});

	it('leaves what a write does not name: setState keeps traits, metadata keeps the other', async () => {
		const { identities } = setup();
		const created = await identities.create({
			traits: ada,
			metadataAdmin: { plan: 'pro' },
		});

		await identities.setState(created.id, 'inactive');
		const written = await identities.updateMetadata(created.id, {
			metadataPublic: { theme: 'dark' },
		});

		expect(written.state).toBe('inactive');
		expect(written.traits).toEqual(ada);
		expect(written.metadataAdmin).toEqual({ plan: 'pro' });
		expect(written.metadataPublic).toEqual({ theme: 'dark' });
	});

	it('refuses a stale ifVersion, on both the one-trip and the read-first path', async () => {
		const { identities } = setup();
		const created = await identities.create({ traits: ada });
		await identities.setState(created.id, 'inactive', { ifVersion: 0 });

		// setState needs no record: one trip, the store refuses.
		const oneTrip = await rejection(
			identities.setState(created.id, 'active', { ifVersion: 0 }),
		);
		// updateTraits needs the record: read first, the core refuses.
		const readFirst = await rejection(
			identities.updateTraits(created.id, ada, { ifVersion: 0 }),
		);

		for (const error of [oneTrip, readFirst]) {
			expect(error).toBeInstanceOf(StoreConflict);
			expect((error as StoreConflict).code).toBe('VERSION_CONFLICT');
			expect((error as StoreConflict).actualVersion).toBe(1);
		}
		expect((await identities.get(created.id)).version).toBe(1);
	});

	it('marks an address verified by value, both fields together', async () => {
		const { identities, clock } = setup();
		const created = await identities.create({ traits: ada });

		const verified = await identities.setAddressVerified(
			created.id,
			ada.email,
			true,
		);
		expect(verified.addresses[0]).toMatchObject({
			verified: true,
			verifiedAt: clock.now(),
		});

		const unverified = await identities.setAddressVerified(
			created.id,
			ada.email,
			false,
		);
		expect(unverified.addresses[0]).toMatchObject({
			verified: false,
			verifiedAt: null,
		});

		const error = await rejection(
			identities.setAddressVerified(created.id, 'other@example.test', true),
		);
		expect(error).toBeInstanceOf(NotFoundError);
	});

	it('refuses to remove a password there is none of', async () => {
		const { identities } = setup();
		const created = await identities.create({ traits: ada });

		const error = await rejection(identities.removePassword(created.id));

		expect((error as CredentialError).code).toBe('CREDENTIAL_MISSING');
	});

	it('refuses a write to an unknown or malformed id with NOT_FOUND', async () => {
		const { identities } = setup();

		for (const id of [mintIdentityId(), 'nope']) {
			expect(
				await rejection(identities.setState(id, 'inactive')),
			).toBeInstanceOf(NotFoundError);
			expect(
				await rejection(identities.setState(id, 'inactive', { ifVersion: 0 })),
			).toBeInstanceOf(NotFoundError);
		}
	});
});

describe('verifyPassword', () => {
	it('verifies against the normalised identifier', async () => {
		const { identities } = setup();
		const created = await identities.create({
			traits: ada,
			password: 'correct horse',
		});

		const result = await identities.verifyPassword(
			'ADA@example.test',
			'correct horse',
		);

		expect(result).toEqual({
			ok: true,
			identity: await identities.get(created.id),
		});
	});

	it('says why it refused — for logs, never for a response body', async () => {
		const { identities } = setup();
		const withPassword = await identities.create({
			traits: ada,
			password: 'correct horse',
		});
		await identities.create({ traits: { ...ada, email: 'nopw@example.test' } });

		expect(
			await identities.verifyPassword('nobody@x.test', 'whatever1'),
		).toEqual({ ok: false, reason: 'noSuchIdentity' });
		expect(
			await identities.verifyPassword('nopw@example.test', 'whatever1'),
		).toEqual({ ok: false, reason: 'noPasswordCredential' });
		expect(
			await identities.verifyPassword(ada.email, 'battery staple'),
		).toEqual({ ok: false, reason: 'wrongPassword' });

		await identities.setState(withPassword.id, 'inactive');
		expect(await identities.verifyPassword(ada.email, 'correct horse')).toEqual(
			{
				ok: false,
				reason: 'identityInactive',
			},
		);
	});

	it('still hashes when no identity holds the identifier', async () => {
		// The dummy comparison: the response time must not say which addresses
		// are registered. Measured by counting, not by timing.
		let verifications = 0;
		const { hasher } = await import('../../test/identities');
		const counting = {
			...hasher,
			verify: (plain: string, hash: string) => {
				verifications += 1;
				return hasher.verify(plain, hash);
			},
		};
		const { identities } = setup({ wiring: { hasher: counting } });

		await identities.verifyPassword('nobody@x.test', 'whatever1');

		expect(verifications).toBe(1);
	});

	it('refuses a hash no wired verifier claims, reporting the prefix and never the hash', async () => {
		const { identities, stores } = setup();
		const created = await identities.create({ traits: ada });
		await stores.identities.updateIdentity(
			created.id,
			{
				updatedAt: new Date(),
				credentials: {
					password: { hash: '$2a$10$sentinelsentinel', updatedAt: new Date() },
				},
			},
			0,
		);

		const error = await rejection(
			identities.verifyPassword(ada.email, 'correct horse'),
		);

		expect((error as CredentialError).code).toBe('HASH_UNSUPPORTED');
		expect((error as CredentialError).hashPrefix).toBe('$2a$');
		expect((error as Error).message).not.toContain('sentinel');
	});

	it('changes and removes the password', async () => {
		const { identities } = setup();
		const created = await identities.create({
			traits: ada,
			password: 'correct horse',
		});

		await identities.setPassword(created.id, 'battery staple');
		expect(
			(await identities.verifyPassword(ada.email, 'battery staple')).ok,
		).toBe(true);

		const removed = await identities.removePassword(created.id);
		expect(removed.hasPassword).toBe(false);
		expect(
			await identities.verifyPassword(ada.email, 'battery staple'),
		).toEqual({ ok: false, reason: 'noPasswordCredential' });
	});
});

describe('wiring', () => {
	it('refuses a password identifier with no hasher: there is no silent fallback', () => {
		expect(() => createIdentities(definition, createMemoryStores())).toThrow(
			TypeError,
		);
	});

	it('refuses two hashers claiming one prefix', async () => {
		const { hasher } = await import('../../test/identities');

		expect(() =>
			createIdentities(definition, createMemoryStores(), {
				hasher,
				verifiers: [hasher],
			}),
		).toThrow('two hashers claim the prefix "$scrypt$"');
	});

	it('refuses a definition that did not come from defineIdentities', () => {
		expect(() =>
			createIdentities({ config: {} } as never, createMemoryStores()),
		).toThrow(
			'createIdentities: the first argument must come from defineIdentities',
		);
	});

	it('wires with no hasher when no password identifier is declared', () => {
		const codeOnly = defineIdentities({
			traits: z.object({ email: z.string() }),
			identifiers: {
				code: { from: 'email', normalize: 'lowercase', via: 'email' },
			},
		});

		expect(() =>
			createIdentities(codeOnly, createMemoryStores()),
		).not.toThrow();
	});
});
