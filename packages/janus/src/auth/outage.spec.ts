import { describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ada, password, rejection, setup } from '../../test/auth';
import { JanusError, NotFoundError, StoreFailure } from '../errors/janus-error';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

/** The reference stores, with one method replaced by one that fails. */
function failing(
	slot: keyof JanusStores,
	method: string,
	failure: () => unknown,
): JanusStores {
	const stores = createMemoryStores();
	return {
		...stores,
		[slot]: { ...stores[slot], [method]: async () => failure() },
	};
}

describe('the scan: no catch around a store call, anywhere but here', () => {
	// The failure this whole design exists to prevent is a single careless
	// `catch { return null }`. So this spec reads the source and refuses any
	// `catch` — and any two-argument `.then`, the same thing spelled
	// differently — in the core outside `outage.ts`.
	it('finds none', async () => {
		const offenders: string[] = [];

		const walk = async (dir: string): Promise<void> => {
			for (const entry of await readdir(dir, { withFileTypes: true })) {
				const path = join(dir, entry.name);
				if (entry.isDirectory()) {
					await walk(path);
				} else if (
					entry.name.endsWith('.ts') &&
					!entry.name.endsWith('.spec.ts') &&
					entry.name !== 'outage.ts'
				) {
					// Block comments blanked, line numbers kept: the port's own doc
					// quotes the forbidden line in order to forbid it.
					const source = (await Bun.file(path).text()).replace(
						/\/\*[\s\S]*?\*\//g,
						(comment) => comment.replace(/[^\n]/g, ' '),
					);
					source.split('\n').forEach((line, index) => {
						const code = line.replace(/\/\/.*$/, '');
						if (/\bcatch\b|\.then\([^)]*,/.test(code)) {
							offenders.push(`${path}:${index + 1}: ${line.trim()}`);
						}
					});
				}
			}
		};
		await walk(import.meta.dir);

		expect(offenders).toEqual([]);
	});

	it('and of the two in outage.ts, one always rethrows and the other absorbs one named conflict', async () => {
		const source = await Bun.file(join(import.meta.dir, 'outage.ts')).text();
		const bodies = [...source.matchAll(/catch \((\w+)\) \{([^}]*)\}/g)].map(
			(match) =>
				(match[2] ?? '')
					.replace(/\/\/.*$/gm, '')
					.replace(/\s+/g, ' ')
					.trim(),
		);

		expect(bodies).toHaveLength(2);
		// The guard's.
		expect(bodies[0]).toContain('throw');
		expect(bodies[0]).not.toContain('return');
		// unlessVersionConflict's: `null` for a version conflict, and nothing
		// else — every other rejection rethrown. Held to the letter, so a
		// widened condition is a failing spec and a reviewed change.
		expect(bodies[1]).toBe(
			"if (error instanceof StoreConflict && error.on === 'version') return null; throw error;",
		);
	});
});

describe('guarded stores', () => {
	it('turns a driver error into STORE_FAILED, keeping it as cause and out of the message', async () => {
		const driver = new Error('connect ECONNREFUSED mongodb://root:sentinel@db');
		const { auth } = setup({
			store: failing('users', 'findUserByLogin', () => {
				throw driver;
			}),
		});

		const error = await rejection(auth.findByLogin(ada.email));

		expect(error).toBeInstanceOf(StoreFailure);
		expect((error as StoreFailure).cause).toBe(driver);
		expect((error as StoreFailure).slot).toBe('users');
		expect((error as StoreFailure).operation).toBe('findUserByLogin');
		expect((error as Error).message).not.toContain('sentinel');
	});

	it('lets a JanusError the adapter threw through, so instanceof holds', async () => {
		const own = new NotFoundError('updateUser: gone');
		const { auth } = setup({
			store: failing('users', 'updateUser', () => {
				throw own;
			}),
		});
		const created = await auth.create(ada);

		expect(await rejection(auth.setActive(created, false))).toBe(own);
	});

	it('refuses undefined where the port says null: the store forgot to answer', async () => {
		const { auth } = setup({
			store: failing('users', 'findUser', () => undefined),
		});

		const error = await rejection(
			auth.find('018f0000-0000-7000-8000-000000000000'),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect((error as Error).message).toContain('an absence is null');
	});

	it('guards a store written as a class, prototype methods included', async () => {
		const reference = createMemoryStores().tokens;
		class Tokens {
			insertToken = reference.insertToken;
			deleteUserTokens = reference.deleteUserTokens;
			async consumeToken(): Promise<null> {
				throw new Error('socket hang up');
			}
		}
		const { auth } = setup({
			store: { ...createMemoryStores(), tokens: new Tokens() },
		});

		const error = await rejection(auth.verifyEmail.confirm('x'));

		expect(error).toBeInstanceOf(StoreFailure);
	});
});

describe('an outage is never a negative answer', () => {
	// For each call whose honest answer can be "nothing", the store failing
	// must reject — never resolve null, false, 0, an empty page, or a refusal
	// that reads like a wrong password.
	const outage = () => {
		throw new Error('primary stepped down');
	};

	it('signIn rejects with STORE_FAILED, never CREDENTIALS_INVALID', async () => {
		const { auth } = setup({
			store: failing('users', 'findUserByLogin', outage),
		});

		const error = await rejection(auth.signIn({ email: ada.email, password }));

		expect(error).toBeInstanceOf(StoreFailure);
	});

	it('authenticate rejects, and never resolves anonymous', async () => {
		const { auth } = setup({
			store: failing('sessions', 'findSessionByTokenHash', outage),
		});

		const error = await rejection(
			auth.authenticate({ authorization: 'Bearer anything' }),
		);

		expect(error).toBeInstanceOf(StoreFailure);
	});

	it('find, list, sign-outs, a reset request and a token redemption reject', async () => {
		type Auth = ReturnType<typeof setup>['auth'];
		const id = '018f0000-0000-7000-8000-000000000000';
		const cases: [
			keyof JanusStores,
			string,
			(auth: Auth) => Promise<unknown>,
		][] = [
			['users', 'findUser', (auth) => auth.find(id)],
			['users', 'findUser', (auth) => auth.findUser(id)],
			['users', 'listUsers', (auth) => auth.list()],
			[
				'users',
				'findUserByLogin',
				(auth) => auth.resetPassword.request(ada.email),
			],
			['sessions', 'revokeUserSessions', (auth) => auth.signOutEverywhere(id)],
			[
				'sessions',
				'findSessionByTokenHash',
				(auth) => auth.signOut({ authorization: 'Bearer anything' }),
			],
			[
				'tokens',
				'consumeToken',
				(auth) => auth.resetPassword.confirm('x', password),
			],
		];

		for (const [slot, method, call] of cases) {
			const { auth } = setup({ store: failing(slot, method, outage) });
			const error = await rejection(call(auth));

			expect(error).toBeInstanceOf(JanusError);
			expect((error as JanusError).code).toBe('STORE_FAILED');
		}
	});
});
