import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { signedUp, throttled } from './sign-in-attempts.fixtures';

/** The reference stores, with one token method that fails once `failing.on` is set. */
function failingTokens(method: 'countAttempt' | 'consumeToken') {
	const stores = createMemoryStores();
	const failing = { on: false };
	const original = stores.tokens[method] as (...args: unknown[]) => unknown;
	const store: JanusStores = {
		...stores,
		tokens: {
			...stores.tokens,
			[method]: async (...args: unknown[]) => {
				if (failing.on) throw new Error('connect ECONNREFUSED');
				return original.apply(stores.tokens, args);
			},
		},
	};
	return { store, failing };
}

describe('signIn, throttled, when the store cannot count', () => {
	it('throws STORE_FAILED — never a refusal, never a sign-in let through uncounted', async () => {
		const { store, failing } = failingTokens('countAttempt');
		const context = throttled({ store });
		const { auth, compared } = context;
		await signedUp(context);
		failing.on = true;
		const before = compared.count;

		const right = await rejection(auth.signIn({ email: ada.email, password }));
		const unknown = await rejection(
			auth.signIn({ email: 'nobody@example.test', password }),
		);

		for (const error of [right, unknown]) {
			expect(error).toBeInstanceOf(StoreFailure);
			expect(error).toMatchObject({
				code: 'STORE_FAILED',
				slot: 'tokens',
				operation: 'countAttempt',
			});
		}
		expect(compared.count).toBe(before);
	});

	it('opens no session when the count cannot start again after the right password', async () => {
		const { store, failing } = failingTokens('consumeToken');
		const opened = { count: 0 };
		const insertSession = store.sessions.insertSession;
		const context = throttled({
			store: {
				...store,
				sessions: {
					...store.sessions,
					insertSession: async (record) => {
						opened.count += 1;
						return insertSession.call(store.sessions, record);
					},
				},
			},
		});
		await signedUp(context);
		const before = opened.count;
		failing.on = true;

		const error = await rejection(
			context.auth.signIn({ email: ada.email, password }),
		);

		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			operation: 'consumeToken',
		});
		expect(opened.count).toBe(before);
	});

	it('throws STORE_FAILED when the store drops a count it just stored', async () => {
		const stores = createMemoryStores();
		const store: JanusStores = {
			...stores,
			tokens: {
				...stores.tokens,
				countAttempt: async () => null,
			},
		};
		const context = throttled({ store });

		const error = await rejection(
			context.auth.signIn({ email: ada.email, password }),
		);

		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			message: 'signIn: the store dropped the attempts it had just stored',
		});
	});
});
