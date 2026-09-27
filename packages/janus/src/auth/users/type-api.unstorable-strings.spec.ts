import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, hasher, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { userRecord } from '../../conformance/fixtures';
import type {
	CredentialError,
	UserInvalidError,
} from '../../errors/janus-error';
import { janus } from '../janus';
import { createMemoryStores } from '../port/memory';

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
