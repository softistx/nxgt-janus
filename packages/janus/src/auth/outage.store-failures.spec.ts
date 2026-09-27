import { describe, expect, it } from 'bun:test';
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
			countAttempt = reference.countAttempt;
			spendUserTokens = reference.spendUserTokens;
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
