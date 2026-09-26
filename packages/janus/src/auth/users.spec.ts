import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import {
	ada,
	bearer,
	clinic,
	hasher,
	password,
	person,
	rejection,
	setup,
} from '../../test/auth';
import { userRecord } from '../conformance/fixtures';
import type {
	CredentialError,
	JanusError,
	StoreConflict,
	UserInvalidError,
} from '../errors/janus-error';
import { mintId } from '../ids/id';
import { createMemoryRelations } from '../permissions/port/memory';
import type { Subject } from '../subjects/subject';
import { scryptHasher } from './hashers';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';
import { hashSecret } from './secrets';

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
		const { janus } = await import('./janus');
		const { createMemoryStores } = await import('./port/memory');
		const { person } = await import('../../test/auth');
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

describe('reading', () => {
	it('answers null for an absence, and a malformed id never reaches the store', async () => {
		const { auth } = setup();

		expect(await auth.find('018f0000-0000-7000-8000-000000000000')).toBeNull();
		expect(await auth.find('../../etc/passwd')).toBeNull();
		expect(await auth.findUser('not-an-id')).toBeNull();
		expect(await auth.findByLogin('nobody@example.test')).toBeNull();
	});

	it('turns an absence into NOT_FOUND only on get', async () => {
		const { auth } = setup();

		const error = (await rejection(
			auth.get('018f0000-0000-7000-8000-000000000000'),
		)) as JanusError;

		expect(error.code).toBe('NOT_FOUND');
	});

	it('pages in creation order, and refuses a cursor it did not mint', async () => {
		const { auth, clock } = setup();
		const ids: string[] = [];
		for (const n of [1, 2, 3]) {
			ids.push(
				(await auth.create({ email: `u${n}@example.test`, name: `U${n}` })).id,
			);
			clock.advance(1);
		}

		const first = await auth.list({ limit: 2 });
		const second = await auth.list({ after: first.nextCursor, limit: 2 });

		expect(first.items.map((u) => u.id)).toEqual(ids.slice(0, 2));
		expect(second.items.map((u) => u.id)).toEqual(ids.slice(2));
		expect(second.nextCursor).toBeNull();
		expect(
			((await rejection(auth.list({ after: 'page-2' }))) as JanusError).code,
		).toBe('INVALID_CURSOR');
	});
});

describe('writing', () => {
	it('merges a patch over the stored fields, and validates the result whole', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, nickname: 'Ada', password });

		const updated = await auth.update(user, { name: 'Ada King' });

		expect(updated).toMatchObject({
			email: ada.email,
			name: 'Ada King',
			nickname: 'Ada',
			version: 1,
		});
		expect(
			((await rejection(auth.update(user, { email: 'nope' }))) as JanusError)
				.code,
		).toBe('USER_INVALID');
	});

	it('refuses a field janus sets, from a schema that passes unknown keys through', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		// The strict schema refuses the key first; either way, nothing is written.
		const error = (await rejection(
			auth.update(user, { active: false } as never),
		)) as JanusError;

		expect(error.code).toBe('USER_INVALID');
		expect((await auth.get(user.id)).active).toBe(true);
	});

	it('moves the login with the e-mail, and un-verifies a new e-mail', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const record = await store.users.findUser(user.id);
		await store.users.updateUser(
			user.id,
			{ updatedAt: new Date(), emailVerifiedAt: new Date() },
			record?.version ?? 0,
		);

		const renamed = await auth.update(user, { name: 'Ada King' });
		const moved = await auth.update(user, { email: 'countess@example.test' });

		expect(renamed.emailVerified).toBe(true);
		expect(moved.emailVerified).toBe(false);
		expect(await auth.findByLogin(ada.email)).toBeNull();
		expect((await auth.findByLogin('countess@example.test'))?.id).toBe(user.id);
	});

	it('refuses a stale ifVersion, and writes nothing', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.update(user, { name: 'Ada King' });

		const error = (await rejection(
			auth.update(user, { name: 'Lost update' }, { ifVersion: user.version }),
		)) as StoreConflict;

		expect(error.code).toBe('VERSION_CONFLICT');
		expect(error.expectedVersion).toBe(0);
		expect(error.actualVersion).toBe(1);
		expect((await auth.get(user.id)).name).toBe('Ada King');
	});

	it('refuses a write to an unknown or malformed id with NOT_FOUND', async () => {
		const { auth } = setup();

		for (const id of ['018f0000-0000-7000-8000-000000000000', 'nope']) {
			const error = (await rejection(auth.setActive(id, false))) as JanusError;
			expect(error.code).toBe('NOT_FOUND');
		}
	});

	it('sets and changes the password, checking the current one', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const wrong = (await rejection(
			auth.changePassword(user, {
				current: 'wrong password',
				next: 'new password',
			}),
		)) as CredentialError;
		await auth.changePassword(user, {
			current: password,
			next: 'new password',
		});

		expect(wrong.code).toBe('CREDENTIALS_INVALID');
		expect(wrong.reason).toBe('wrongPassword');
		await auth.signIn({ email: ada.email, password: 'new password' });

		const bare = await auth.create({
			email: 'bare@example.test',
			name: 'Bare',
		});
		expect(bare.hasPassword).toBe(false);
		expect((await auth.setPassword(bare, 'first password')).hasPassword).toBe(
			true,
		);
	});
});

describe('several user types', () => {
	it('keeps each type to itself: login unique per type, and find by type', async () => {
		const { auth } = clinic();
		const patient = await auth.patient.signUp({
			email: 'grace@example.test',
			birthDate: '1906-12-09',
			password,
		});
		// The same person, as staff, is another user.
		const staff = await auth.staff.signUp({
			username: 'grace@example.test',
			service: 'navy',
			password,
		});

		expect(patient.user.type).toBe('patient');
		expect(staff.user.type).toBe('staff');
		expect(await auth.staff.find(patient.user.id)).toBeNull();
		expect((await auth.findUser(patient.user.id))?.type).toBe('patient');
		expect((await auth.patient.list()).items.map((u) => u.id)).toEqual([
			patient.user.id,
		]);
	});

	it('normalises each type by its own rule', async () => {
		const { auth } = clinic();
		await auth.staff.signUp({ username: 'Grace', service: 'navy', password });

		// `normalize: 'none'` for staff usernames: case matters.
		expect(await auth.staff.findByLogin('grace')).toBeNull();
		expect(await auth.staff.findByLogin('Grace')).not.toBeNull();
	});

	it('names the type in the operation of a refusal', async () => {
		const { auth } = clinic();

		const error = (await rejection(
			auth.staff.signIn({ username: 'nobody', password }),
		)) as CredentialError;

		expect(error.message).toStartWith('staff.signIn:');
		expect(error.userType).toBe('staff');
	});
});

describe('rehash on sign-in', () => {
	/** A hasher an old database was written with: toy, and the point. */
	const legacy = {
		prefix: '$legacy$',
		hash: async (plain: string) => `$legacy$${plain}`,
		verify: async (plain: string, hash: string) => hash === `$legacy$${plain}`,
	};

	/** A store holding Ada with a legacy hash, and an instance that verifies it. */
	async function migrating(
		wrap: (store: JanusStores) => JanusStores = (store) => store,
	) {
		const store = createMemoryStores();
		const createdAt = new Date(Date.UTC(2020, 0, 1));
		await store.users.insertUser({
			id: mintId(),
			type: 'user',
			schemaVersion: '1',
			active: true,
			fields: ada,
			logins: [ada.email],
			password: { hash: await legacy.hash(password), updatedAt: createdAt },
			emailVerifiedAt: null,
			version: 0,
			createdAt,
			updatedAt: createdAt,
		});
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store: wrap(store),
			hasher,
			verifiers: [legacy],
		});
		return { auth, store, createdAt };
	}

	it('rewrites a hash another hasher wrote, keeping when the password was set', async () => {
		const { auth, store, createdAt } = await migrating();

		const { user } = await auth.signIn({ email: ada.email, password });
		const record = await store.users.findUser(user.id);

		expect(record?.password?.hash).toStartWith('$scrypt$ln=10,');
		expect(record?.password?.updatedAt).toEqual(createdAt);
		expect(user.version).toBe(1);
		// Once rewritten, a sign-in writes nothing.
		await auth.signIn({ email: ada.email, password });
		expect((await store.users.findUser(user.id))?.version).toBe(1);
	});

	it('rewrites a hash its own hasher wrote with other parameters', async () => {
		const { auth, store } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const raised = janus({
			user: person,
			password: { login: 'email' },
			store,
			hasher: scryptHasher({ cost: 11 }),
		});

		await raised.signIn({ email: ada.email, password });

		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$scrypt$ln=11,',
		);
	});

	it('signs in all the same when a concurrent update wins the race, and rehashes next time', async () => {
		let raced = false;
		const { auth, store } = await migrating((inner) => ({
			...inner,
			users: {
				...inner.users,
				// Somebody else writes between the read and the rehash.
				async findUserByLogin(type, login) {
					const found = await inner.users.findUserByLogin(type, login);
					if (found !== null && !raced) {
						raced = true;
						await inner.users.updateUser(
							found.id,
							{ updatedAt: new Date(), fields: { ...ada, name: 'Ada King' } },
							found.version,
						);
					}
					return found;
				},
			},
		}));

		const { user } = await auth.signIn({ email: ada.email, password });

		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$legacy$',
		);
		await auth.signIn({ email: ada.email, password });
		expect((await store.users.findUser(user.id))?.password?.hash).toStartWith(
			'$scrypt$',
		);
	});

	it('fails the sign-in when the rehash meets an outage, and opens no session', async () => {
		let sessions = 0;
		const { auth } = await migrating((inner) => ({
			...inner,
			users: {
				...inner.users,
				updateUser: async () => {
					throw new Error('connect ECONNREFUSED');
				},
			},
			sessions: {
				...inner.sessions,
				insertSession: async (record) => {
					sessions += 1;
					return inner.sessions.insertSession(record);
				},
			},
		}));

		const error = (await rejection(
			auth.signIn({ email: ada.email, password }),
		)) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
		expect(sessions).toBe(0);
	});
});

describe('delete', () => {
	it('deletes the user with their sessions and tokens, and frees the login', async () => {
		const { auth, store } = setup();
		const { user, token } = await auth.signUp({ ...ada, password });
		const sent = await auth.verifyEmail.send(user);

		expect(await auth.delete(user)).toBe(true);

		// Read in the store itself: the core would refuse a leftover token all
		// the same, so only the store can tell whether the e-mail it holds went.
		expect(
			await store.tokens.consumeToken(
				hashSecret(sent.token),
				'verifyEmail',
				new Date(),
			),
		).toBeNull();
		expect(await auth.find(user.id)).toBeNull();
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(
			await store.sessions.findSessionByTokenHash(hashSecret(token)),
		).toBeNull();
		expect(
			((await rejection(auth.verifyEmail.confirm(sent.token))) as JanusError)
				.code,
		).toBe('TOKEN_UNKNOWN');
		expect(await auth.delete(user)).toBe(false);
		// The e-mail is free for a new account.
		await auth.signUp({ ...ada, password });
	});

	it('answers false for a malformed id, and for another type’s user, whom it leaves whole', async () => {
		const { auth } = clinic();
		const patient = await auth.patient.signUp({
			email: 'ada@example.test',
			birthDate: '1815-12-10',
			password,
		});

		expect(await auth.staff.delete(patient.user)).toBe(false);
		expect(await auth.patient.delete('not-an-id')).toBe(false);
		expect(await auth.patient.find(patient.user.id)).not.toBeNull();
		expect(await auth.authenticate(bearer(patient.token))).not.toBeNull();
	});

	it('leaves only inert leftovers when interrupted, and a replay deletes them', async () => {
		let down = true;
		const inner = createMemoryStores();
		const { auth } = setup({
			store: {
				...inner,
				sessions: {
					...inner.sessions,
					deleteUserSessions: async (userId) => {
						if (down) throw new Error('primary stepped down');
						return inner.sessions.deleteUserSessions(userId);
					},
				},
			},
		});
		const { user, token } = await auth.signUp({ ...ada, password });

		const error = (await rejection(auth.delete(user))) as JanusError;

		expect(error.code).toBe('STORE_FAILED');
		// Gone, and the session left behind authenticates nobody.
		expect(await auth.find(user.id)).toBeNull();
		expect(await auth.authenticate(bearer(token))).toBeNull();
		expect(
			await inner.sessions.findSessionByTokenHash(hashSecret(token)),
		).not.toBeNull();

		down = false;
		expect(await auth.delete(user)).toBe(false);
		expect(
			await inner.sessions.findSessionByTokenHash(hashSecret(token)),
		).toBeNull();
	});

	describe('with a relation store wired', () => {
		const signUp = (auth: ReturnType<typeof clinic>['auth']) =>
			auth.patient.signUp({
				email: `${mintId()}@example.test`,
				birthDate: '1815-12-10',
				password,
			});
		const viewer = (subject: Subject) => ({
			object: { type: 'record', id: mintId() },
			relation: 'viewer',
			subject,
		});

		it('deletes every tuple naming the user, and no one else’s', async () => {
			const relations = createMemoryRelations();
			const { auth } = clinic({ relations });
			const [ada, bob] = [await signUp(auth), await signUp(auth)];
			const own = viewer({ type: 'patient', id: ada.user.id });
			const through = {
				object: { type: 'team', id: mintId() },
				relation: 'member',
				subject: { type: 'patient', id: ada.user.id },
			};
			// Same id, another type: somebody else.
			const namesake = viewer({ type: 'staff', id: ada.user.id });
			const other = viewer({ type: 'patient', id: bob.user.id });
			await relations.write({ add: [own, through, namesake, other] });

			expect(await auth.patient.delete(ada.user)).toBe(true);

			expect(await relations.has(own)).toBe(false);
			expect(await relations.has(through)).toBe(false);
			expect(await relations.has(namesake)).toBe(true);
			expect(await relations.has(other)).toBe(true);
		});

		it('deletes the tuples on the user as an object, and on sets of them', async () => {
			const relations = createMemoryRelations();
			const { auth } = clinic({ relations });
			const [ada, bob] = [await signUp(auth), await signUp(auth)];
			const managed = {
				object: { type: 'patient', id: ada.user.id },
				relation: 'managers',
				subject: { type: 'patient', id: bob.user.id },
			};
			const theirs = viewer({
				type: 'patient',
				id: ada.user.id,
				relation: 'managers',
			});
			await relations.write({ add: [managed, theirs] });

			expect(await auth.patient.delete(ada.user)).toBe(true);

			expect(await relations.has(managed)).toBe(false);
			expect(await relations.has(theirs)).toBe(false);
		});

		it('rejects STORE_FAILED when the tuples cannot be deleted, and a replay deletes them', async () => {
			let down = true;
			const inner = createMemoryRelations();
			const { auth } = clinic({
				relations: {
					...inner,
					deleteEntity: async (entity) => {
						if (down) throw new Error('primary stepped down');
						return inner.deleteEntity(entity);
					},
				},
			});
			const { user } = await signUp(auth);
			const own = viewer({ type: 'patient', id: user.id });
			await inner.write({ add: [own] });

			const error = (await rejection(auth.patient.delete(user))) as JanusError;
			expect(error.code).toBe('STORE_FAILED');
			expect(await auth.patient.find(user.id)).toBeNull();
			expect(await inner.has(own)).toBe(true);

			down = false;
			expect(await auth.patient.delete(user)).toBe(false);
			expect(await inner.has(own)).toBe(false);
		});

		it('refuses, when wiring, a relation store that cannot delete', () => {
			const { deleteEntity: _, ...partial } = createMemoryRelations();

			expect(() => clinic({ relations: partial as never })).toThrow(
				'relations.deleteEntity is missing',
			);
		});
	});
});

describe('strings no store can keep', () => {
	const nul = 'Ada\u0000Lovelace';
	const lone = 'Ada \uD800';

	/**
	 * The memory store, refusing what PostgreSQL refuses — found as a driver
	 * finds it, by encoding to UTF-8, not with the predicate under test. The
	 * core must never ask it.
	 */
	function strict() {
		const store = createMemoryStores();
		const asked: string[] = [];
		const utf8 = (text: string) =>
			new TextDecoder().decode(new TextEncoder().encode(text));
		const refuse = (value: unknown): void => {
			if (typeof value === 'string') {
				if (
					[...value].some((c) => c.codePointAt(0) === 0) ||
					utf8(value) !== value
				) {
					throw new Error('22021: invalid byte sequence for encoding "UTF8"');
				}
			} else if (Array.isArray(value)) {
				for (const inner of value) refuse(inner);
			} else if (typeof value === 'object' && value !== null) {
				for (const [key, inner] of Object.entries(value)) {
					refuse(key);
					refuse(inner);
				}
			}
		};
		const { findUserByLogin, insertUser, updateUser } = store.users;
		store.users.findUserByLogin = async (type, login) => {
			asked.push('findUserByLogin');
			refuse(login);
			return findUserByLogin(type, login);
		};
		store.users.insertUser = async (record) => {
			asked.push('insertUser');
			refuse([record.fields, record.logins]);
			return insertUser(record);
		};
		store.users.updateUser = async (id, patch, version) => {
			asked.push('updateUser');
			refuse([patch.fields ?? null, patch.logins ?? null]);
			return updateUser(id, patch, version);
		};
		return { ...setup({ store }), asked };
	}

	it('refuses the stand-in itself: it would fail where PostgreSQL fails', async () => {
		const { store } = strict();
		for (const name of [nul, lone]) {
			const error = await rejection(
				store.users.insertUser(
					userRecord({ fields: { email: 'ada@example.test', name } }),
				),
			);
			expect(String(error)).toContain('22021');
		}
	});

	it('refuses a NUL or a lone surrogate in a field with USER_INVALID, never STORE_FAILED', async () => {
		const { auth } = strict();

		for (const name of [nul, lone]) {
			const error = (await rejection(
				auth.signUp({ ...ada, name, password }),
			)) as UserInvalidError;

			expect(error.code).toBe('USER_INVALID');
			expect(error.issues).toEqual([
				{
					path: ['name'],
					message:
						'holds a NUL character or a lone surrogate, which no store can keep',
				},
			]);
			expect(error.message).not.toContain(name);
		}
	});

	it('refuses one at any depth, and in a key without putting the key in the message', async () => {
		const auth = janus({
			user: z.object({
				email: z.email(),
				tags: z.array(z.string()),
				meta: z.record(z.string(), z.string()),
			}),
			store: createMemoryStores(),
		});

		const error = (await rejection(
			auth.create({
				email: 'ada@example.test',
				tags: ['ok', nul],
				meta: { [`k${'\u0000'}`]: 'v' },
			}),
		)) as UserInvalidError;

		expect(error.issues?.map((issue) => issue.path)).toEqual([
			['tags', 1],
			['meta'],
		]);
		expect(error.issues?.[1]?.message).toStartWith('a key holds');
		expect(error.message).not.toContain('\u0000');
	});

	it('keeps every other character: control characters, and a surrogate pair', async () => {
		const { auth, store } = strict();

		const { user } = await auth.signUp({
			...ada,
			name: 'Ada\u0001\u001f\uFFFF 😀',
			password,
		});

		expect((await store.users.findUser(user.id))?.fields.name).toBe(
			'Ada\u0001\u001f\uFFFF 😀',
		);
	});

	it('answers a login no store can keep as nobody’s, without asking the store', async () => {
		const { auth } = strict();
		await auth.signUp({ ...ada, password });

		expect(await auth.findByLogin(`${ada.email}\u0000`)).toBeNull();
		expect(await auth.resetPassword.request(`${ada.email}\uDC00`)).toBeNull();
		const error = (await rejection(
			auth.signIn({ email: `${ada.email}\u0000`, password }),
		)) as CredentialError;
		expect(error.code).toBe('CREDENTIALS_INVALID');
		expect(error.reason).toBe('unknownLogin');
	});

	it('refuses one in an update patch, and never writes it', async () => {
		const { auth, asked } = strict();
		const { user } = await auth.signUp({ ...ada, password });
		asked.length = 0;

		const error = (await rejection(
			auth.update(user, { nickname: nul }),
		)) as UserInvalidError;

		expect(error.code).toBe('USER_INVALID');
		expect(error.issues?.map((issue) => issue.path)).toEqual([['nickname']]);
		expect(asked).not.toContain('updateUser');
	});

	it('refuses a login a function normaliser cut in half, rather than store one nobody can sign in with', async () => {
		const store = createMemoryStores();
		const auth = janus({
			user: z.strictObject({ username: z.string(), email: z.email() }),
			// Keeps four UTF-16 units: the emoji's first half, alone.
			password: { login: 'username', normalize: (value) => value.slice(0, 4) },
			store,
			hasher,
		});

		const error = (await rejection(
			auth.signUp({ username: 'abc😀', email: 'abc@example.test', password }),
		)) as UserInvalidError;

		expect(error.code).toBe('USER_INVALID');
		expect(error.issues).toEqual([
			{
				path: ['username'],
				message:
					'normalises to a login that holds a NUL character or a lone surrogate, which no store can keep',
			},
		]);
		expect(
			await store.users.listUsers({ type: 'user', after: null, limit: 10 }),
		).toEqual({
			items: [],
			nextCursor: null,
		});
	});

	it('cuts a schema issue path at a key no store can keep, so the key never reaches the message', async () => {
		const auth = janus({
			user: z.object({
				email: z.email(),
				meta: z.record(z.string(), z.number()),
			}),
			store: createMemoryStores(),
		});

		const error = (await rejection(
			auth.create({
				email: 'ada@example.test',
				meta: { [`k${'\u0000'}`]: 'x' as never },
			}),
		)) as UserInvalidError;

		expect(error.issues?.map((issue) => issue.path)).toEqual([['meta']]);
		expect(error.message).not.toContain('\u0000');
	});
});
