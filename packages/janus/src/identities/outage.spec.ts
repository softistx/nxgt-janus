import { describe, expect, it } from 'bun:test';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { ada, rejection, setup } from '../../test/identities';
import { JanusError, NotFoundError, StoreFailure } from '../errors/janus-error';
import { createMemoryStores } from './port/memory';
import type { IdentityStores } from './port/types';

/** The reference stores, with one method replaced by one that fails. */
function failing(
	slot: keyof IdentityStores,
	method: string,
	failure: () => unknown,
): IdentityStores {
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
	// differently — in the identity core outside `outage.ts`.
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

	it('and the one catch in outage.ts always rethrows', async () => {
		const source = await Bun.file(join(import.meta.dir, 'outage.ts')).text();
		const catches = [...source.matchAll(/catch \((\w+)\) \{([^}]*)\}/g)];

		expect(catches).toHaveLength(1);
		expect(catches[0]?.[2]).toContain('throw');
		expect(catches[0]?.[2]).not.toContain('return');
	});
});

describe('guarded stores', () => {
	it('turns a driver error into STORE_FAILED, keeping it as cause and out of the message', async () => {
		const driver = new Error('connect ECONNREFUSED mongodb://root:sentinel@db');
		const { identities } = setup({
			stores: failing('identities', 'findIdentityByIdentifier', () => {
				throw driver;
			}),
		});

		const error = await rejection(
			identities.findByIdentifier('password', ada.email),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect((error as StoreFailure).cause).toBe(driver);
		expect((error as StoreFailure).slot).toBe('identities');
		expect((error as StoreFailure).operation).toBe('findIdentityByIdentifier');
		expect((error as Error).message).not.toContain('sentinel');
	});

	it('lets a JanusError the adapter threw through, so instanceof holds', async () => {
		const own = new NotFoundError('updateIdentity: gone');
		const { identities } = setup({
			stores: failing('identities', 'updateIdentity', () => {
				throw own;
			}),
		});
		const created = await identities.create({ traits: ada });

		expect(await rejection(identities.setState(created.id, 'inactive'))).toBe(
			own,
		);
	});

	it('refuses undefined where the port says null: the store forgot to answer', async () => {
		const { identities } = setup({
			stores: failing('identities', 'findIdentity', () => undefined),
		});

		const error = await rejection(
			identities.find('018f0000-0000-7000-8000-000000000000'),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect((error as Error).message).toContain('an absence is null');
	});

	it('guards a store written as a class, prototype methods included', async () => {
		const reference = createMemoryStores().tokens;
		class Tokens {
			insertToken = reference.insertToken;
			async consumeToken(): Promise<null> {
				throw new Error('socket hang up');
			}
		}
		const { identities } = setup({
			stores: { ...createMemoryStores(), tokens: new Tokens() },
		});

		const error = await rejection(identities.tokens.consumeRecovery('x'));

		expect(error).toBeInstanceOf(StoreFailure);
	});
});

describe('an outage is never a negative answer', () => {
	// For each call whose honest answer can be "nothing", the store failing
	// must reject — never resolve null, false, ok: false or an empty page.
	const outage = () => {
		throw new Error('primary stepped down');
	};

	it('verifyPassword rejects, and never resolves ok: false', async () => {
		const { identities } = setup({
			stores: failing('identities', 'findIdentityByIdentifier', outage),
		});

		const error = await rejection(
			identities.verifyPassword(ada.email, 'whatever1'),
		);

		expect(error).toBeInstanceOf(StoreFailure);
	});

	it('resolve rejects, and never resolves anonymous', async () => {
		const { identities } = setup({
			stores: failing('sessions', 'findSessionByTokenHash', outage),
		});

		const error = await rejection(
			identities.sessions.resolve({ authorization: 'Bearer anything' }),
		);

		expect(error).toBeInstanceOf(StoreFailure);
	});

	it('find, list, revoke and a token redemption reject', async () => {
		const cases: [
			keyof IdentityStores,
			string,
			(i: ReturnType<typeof setup>['identities']) => Promise<unknown>,
		][] = [
			[
				'identities',
				'findIdentity',
				(i) => i.find('018f0000-0000-7000-8000-000000000000'),
			],
			['identities', 'listIdentities', (i) => i.list()],
			[
				'sessions',
				'revokeSession',
				(i) => i.sessions.revoke('018f0000-0000-7000-8000-000000000000'),
			],
			[
				'sessions',
				'revokeIdentitySessions',
				(i) => i.sessions.revokeAll('018f0000-0000-7000-8000-000000000000'),
			],
			['tokens', 'consumeToken', (i) => i.tokens.consumeRecovery('x')],
		];

		for (const [slot, method, call] of cases) {
			const { identities } = setup({ stores: failing(slot, method, outage) });
			const error = await rejection(call(identities));

			expect(error).toBeInstanceOf(JanusError);
			expect((error as JanusError).code).toBe('STORE_FAILED');
		}
	});
});
