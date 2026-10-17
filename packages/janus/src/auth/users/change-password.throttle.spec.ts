import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { CredentialError, StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import {
	guess,
	signedUp,
	type Throttled,
	throttled,
	WINDOW_MS,
} from '../sign-in-attempts.fixtures';
import type { UserRef } from '../types';

const NEXT = 'a brand new password';

/** Tries `count` wrong current passwords for `user`, and answers each reason. */
async function change(
	{ auth }: Throttled,
	user: UserRef,
	count: number,
	current = 'wrong password',
): Promise<unknown[]> {
	const reasons: unknown[] = [];
	for (let at = 0; at < count; at += 1) {
		const error = await rejection(
			auth.changePassword(user, { current, next: NEXT }),
		);
		expect(error).toMatchObject({ code: 'CREDENTIALS_INVALID' });
		reasons.push(error instanceof CredentialError ? error.reason : undefined);
	}
	return reasons;
}

describe('changePassword, counted in the sign-in throttle of the login', () => {
	it('refuses the right current password after ten wrong ones, with retryAfter, writing nothing', async () => {
		const context = throttled();
		const { auth, clock, compared } = context;
		const user = await signedUp(context);

		expect(await change(context, user, 10)).toEqual(
			Array.from({ length: 10 }, () => 'wrongPassword'),
		);
		clock.advance(60_000);
		const before = compared.count;
		const refused = await rejection(
			auth.changePassword(user, { current: password, next: NEXT }),
		);

		expect(refused).toMatchObject({
			code: 'CREDENTIALS_INVALID',
			reason: 'throttled',
			retryAfter: 840,
			userType: 'user',
		});
		expect(compared.count).toBe(before);
		expect(
			(await auth.signIn({ email: ada.email, password }).catch((e) => e))
				.reason,
		).toBe('throttled');
		clock.advance(WINDOW_MS);
		expect((await auth.signIn({ email: ada.email, password })).user.id).toBe(
			user.id,
		);
	});

	it('works again once the window ends', async () => {
		const context = throttled();
		const { auth, clock } = context;
		const user = await signedUp(context);
		await change(context, user, 11);

		clock.advance(WINDOW_MS);
		await auth.changePassword(user, { current: password, next: NEXT });

		expect(
			(await auth.signIn({ email: ada.email, password: NEXT })).user.id,
		).toBe(user.id);
	});

	it('shares one budget with signIn, in both directions', async () => {
		const first = throttled();
		const one = await signedUp(first);
		await guess(first, 6);
		expect(await change(first, one, 4)).toEqual(
			Array.from({ length: 4 }, () => 'wrongPassword'),
		);
		expect(await change(first, one, 1)).toEqual(['throttled']);

		const second = throttled();
		const other = await signedUp(second);
		await change(second, other, 6);
		await guess(second, 4);
		expect(await guess(second, 1)).toEqual(['throttled']);
	});

	it('starts the count again after a change that succeeded', async () => {
		const context = throttled();
		const { auth } = context;
		const user = await signedUp(context);

		await change(context, user, 9);
		await auth.changePassword(user, { current: password, next: NEXT });

		expect(await change(context, user, 10, 'still wrong')).not.toContain(
			'throttled',
		);
		expect(await change(context, user, 1, 'still wrong')).toEqual([
			'throttled',
		]);
	});

	it('counts a user with no password all the same', async () => {
		const context = throttled();
		const { auth } = context;
		const user = await auth.create({ ...ada });

		const reasons = await change(context, user, 11);

		expect(reasons.slice(0, 10)).toEqual(
			Array.from({ length: 10 }, () => 'noPassword'),
		);
		expect(reasons[10]).toBe('throttled');
	});

	it('counts nothing with the throttle off', async () => {
		const context = throttled({ signIn: { throttle: false } });
		const user = await signedUp(context);

		expect(await change(context, user, 15)).not.toContain('throttled');
	});

	it('throws STORE_FAILED, never a refusal, when the store cannot count', async () => {
		const stores = createMemoryStores();
		const failing = { on: false };
		const store: JanusStores = {
			...stores,
			tokens: {
				...stores.tokens,
				countAttempt: async (...args) => {
					if (failing.on) throw new Error('connect ECONNREFUSED');
					return stores.tokens.countAttempt(...args);
				},
			},
		};
		const context = throttled({ store });
		const user = await signedUp(context);
		failing.on = true;

		const error = await rejection(
			context.auth.changePassword(user, { current: password, next: NEXT }),
		);

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			operation: 'countAttempt',
		});
	});
});
