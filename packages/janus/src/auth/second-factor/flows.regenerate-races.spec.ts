import { describe, expect, it } from 'bun:test';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { enrolled, setup } from './flows.fixtures';

/** The reference stores, whose token method fails while `failing` is set. */
function outage(method: 'countAttempt' | 'insertToken') {
	const stores = createMemoryStores();
	const state = { failing: false };
	const original = stores.tokens[method].bind(stores.tokens) as (
		...args: unknown[]
	) => Promise<unknown>;
	const tokens = {
		...stores.tokens,
		[method]: async (...args: unknown[]) => {
			if (state.failing) throw new Error('connect ECONNREFUSED');
			return original(...args);
		},
	};
	return { stores: { ...stores, tokens } as JanusStores, state };
}

const outcome = () => 'regenerated';
const code = (error: unknown) => (error as { code?: string }).code;

describe('secondFactor.regenerateRecoveryCodes, at once', () => {
	it('counts twenty wrong codes tried at once: five are compared, fifteen refused unread', async () => {
		const context = setup();
		const { auth, codeOf, wrongCodeOf } = context;
		const { secret, user } = await enrolled(context);

		const refusals = await Promise.all(
			Array.from({ length: 20 }, () =>
				rejection(
					auth.secondFactor.regenerateRecoveryCodes(user, wrongCodeOf(secret)),
				),
			),
		);

		const left = refusals.map(
			(error) => (error as { attemptsLeft?: number }).attemptsLeft,
		);
		const tooMany = refusals.filter((error) =>
			(error as Error).message.includes('too many codes tried'),
		);
		expect(refusals.every((error) => code(error) === 'CODE_INVALID')).toBe(
			true,
		);
		expect(tooMany).toHaveLength(15);
		expect(left.filter((n) => n !== 0).sort()).toEqual([1, 2, 3, 4]);
		expect(
			code(
				await rejection(
					auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret)),
				),
			),
		).toBe('CODE_INVALID');
	});

	it('regenerates once for the right code tried twice at once: the other write is VERSION_CONFLICT', async () => {
		const context = setup();
		const { auth, codeOf } = context;
		const { secret, user } = await enrolled(context);
		const right = codeOf(secret);

		const outcomes = await Promise.all([
			auth.secondFactor
				.regenerateRecoveryCodes(user, right)
				.then(outcome, code),
			auth.secondFactor
				.regenerateRecoveryCodes(user, right)
				.then(outcome, code),
		]);

		expect(outcomes.sort()).toEqual(['VERSION_CONFLICT', 'regenerated']);
	});
});

describe('secondFactor.regenerateRecoveryCodes, store outage', () => {
	for (const method of ['countAttempt', 'insertToken'] as const) {
		it(`throws STORE_FAILED when tokens.${method} fails — never a refusal, and counts nothing`, async () => {
			const { stores, state } = outage(method);
			const context = setup({ store: stores });
			const { auth, codeOf } = context;
			const { secret, user } = await enrolled(context);

			state.failing = true;
			const failures = await Promise.all(
				Array.from({ length: 6 }, () =>
					rejection(
						auth.secondFactor.regenerateRecoveryCodes(user, codeOf(secret)),
					),
				),
			);
			state.failing = false;

			for (const failure of failures) {
				expect(failure).toBeInstanceOf(StoreFailure);
				expect(failure).toMatchObject({
					code: 'STORE_FAILED',
					slot: 'tokens',
					operation: method,
				});
			}
			const fresh = await auth.secondFactor.regenerateRecoveryCodes(
				user,
				codeOf(secret),
			);
			expect(fresh.recoveryCodes).toHaveLength(10);
		});
	}
});
