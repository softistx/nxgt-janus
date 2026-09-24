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

/** The two files allowed a `catch`: the shared guard, and outage.ts. */
const GUARD = join(import.meta.dir, '..', 'stores', 'guard.ts');
const OUTAGE = join(import.meta.dir, 'outage.ts');
const ALLOWED = new Set([GUARD, OUTAGE]);

/** The body of every `catch` in a file, comments out, whitespace collapsed. */
async function catchBodies(path: string): Promise<string[]> {
	const source = await Bun.file(path).text();
	return [...source.matchAll(/catch \((\w+)\) \{([^}]*)\}/g)].map((match) =>
		(match[2] ?? '')
			.replace(/\/\/.*$/gm, '')
			.replace(/\s+/g, ' ')
			.trim(),
	);
}

describe('the scan: no catch around a store call, in auth, permissions or stores, anywhere but the guard and outage.ts', () => {
	// The failure this whole design exists to prevent is a single careless
	// `catch { return null }`. So this spec reads the source and refuses any
	// `catch` — and any two-argument `.then`, the same thing spelled
	// differently — in the core outside the guard and `outage.ts`.
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
					!ALLOWED.has(path)
				) {
					offenders.push(
						...forbiddenIn(await Bun.file(path).text()).map(
							(line) => `${path}:${line}`,
						),
					);
				}
			}
		};
		await walk(import.meta.dir);
		// The permission engine keeps the same invariant: a denial is false,
		// and a failure throws — so no catch there either.
		await walk(join(import.meta.dir, '..', 'permissions'));
		await walk(join(import.meta.dir, '..', 'stores'));

		expect(offenders).toEqual([]);
	});

	it('sees a two-argument then however it is spelled — measured: the first regex missed two', () => {
		// A mutation of the permission engine, `.then((x) => x, () => false)`
		// around a store call, passed the line-by-line regex: it stopped at the
		// first `)`, and a call split over lines never matched at all.
		expect(forbiddenIn('store.has(t).then((x) => x, () => false);')).toEqual([
			1,
		]);
		expect(
			forbiddenIn('store.has(t).then(\n\t(x) => x,\n\t() => false,\n);'),
		).toEqual([1]);
		expect(forbiddenIn('try { a() } catch { return null }')).toEqual([1]);
		// One argument, even with the trailing comma a formatter writes.
		expect(forbiddenIn('p.then((x) => f(x, y));')).toEqual([]);
		expect(forbiddenIn('p.then(\n\t(x) => f(x, y),\n);')).toEqual([]);
		// Comments quote the forbidden line in order to forbid it.
		expect(
			forbiddenIn('// never catch { return null }\n/* .then(a, b) */'),
		).toEqual([]);
	});

	it("and of the two allowed, the guard's always rethrows and outage.ts's absorbs one named conflict", async () => {
		// Every catch and two-argument then, bound or not: one each, no more.
		for (const path of ALLOWED) {
			expect(forbiddenIn(await Bun.file(path).text())).toHaveLength(1);
		}

		const guard = await catchBodies(GUARD);
		expect(guard).toHaveLength(1);
		expect(guard[0]).toContain('throw');
		expect(guard[0]).not.toContain('return');

		// unlessVersionConflict's: `null` for a version conflict, and nothing
		// else — every other rejection rethrown. Held to the letter, so a
		// widened condition is a failing spec and a reviewed change.
		const outage = await catchBodies(OUTAGE);
		expect(outage).toHaveLength(1);
		expect(outage[0]).toBe(
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

/**
 * The lines, 1-based, holding a `catch` or a two-argument `.then` — the same
 * thing spelled differently. Comments are blanked first, line breaks kept, and
 * each `.then(` is read to its closing parenthesis, so neither a parameter in
 * parentheses nor a call split over lines hides its second argument.
 */
function forbiddenIn(text: string): number[] {
	const source = text
		.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
		.replace(/\/\/[^\n]*/g, (comment) => ' '.repeat(comment.length));
	const lineAt = (index: number) => source.slice(0, index).split('\n').length;
	const lines = new Set<number>();

	for (const match of source.matchAll(/\bcatch\b/g))
		lines.add(lineAt(match.index));

	for (const match of source.matchAll(/\.then\(/g)) {
		let depth = 0;
		const commas: number[] = [];
		for (let i = match.index + match[0].length; i < source.length; i += 1) {
			const char = source[i];
			if (char === '(' || char === '[' || char === '{') depth += 1;
			else if (char === ')' || char === ']' || char === '}') {
				if (depth === 0) {
					// An argument after a comma is a second argument; a comma
					// followed only by whitespace is a formatter's trailing one.
					const ends = [...commas.slice(1), i];
					if (
						commas.some((at, k) => source.slice(at + 1, ends[k]).trim() !== '')
					) {
						lines.add(lineAt(match.index));
					}
					break;
				}
				depth -= 1;
			} else if (char === ',' && depth === 0) commas.push(i);
		}
	}

	return [...lines].sort((a, b) => a - b);
}
