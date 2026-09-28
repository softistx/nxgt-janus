import { describe, expect, it } from 'bun:test';
import { ada, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { createMemoryStores } from './port/memory';
import {
	guess,
	signedUp,
	THROTTLED,
	throttled,
	WINDOW_MS,
} from './sign-in-attempts.fixtures';

describe('signIn, throttled per login', () => {
	it('refuses the right password after ten wrong ones, with retryAfter, comparing nothing', async () => {
		const context = throttled();
		const { auth, clock, compared } = context;
		const user = await signedUp(context);

		expect(await guess(context, 10)).toEqual(
			Array.from({ length: 10 }, () => 'wrongPassword'),
		);
		clock.advance(60_000);
		const before = compared.count;
		const refused = await rejection(
			auth.signIn({ email: ada.email, password }),
		);

		expect(refused).toMatchObject({
			code: 'CREDENTIALS_INVALID',
			reason: 'throttled',
			retryAfter: 840,
			userType: 'user',
			message: THROTTLED,
		});
		// No user is named: the refusal is the same for a login nobody holds.
		expect((refused as { userId?: unknown }).userId).toBeUndefined();
		expect(compared.count).toBe(before);
		expect(await auth.find(user.id)).not.toBeNull();
	});

	it('signs in again once the window ends: nothing locks', async () => {
		const context = throttled();
		const { auth, clock } = context;
		const user = await signedUp(context);
		await guess(context, 11);

		clock.advance(WINDOW_MS);
		const signedIn = await auth.signIn({ email: ada.email, password });

		expect(signedIn.user.id).toBe(user.id);
	});

	it('starts the count again after a sign-in that succeeded', async () => {
		const context = throttled();
		const { auth } = context;
		await signedUp(context);

		await guess(context, 9);
		await auth.signIn({ email: ada.email, password });

		expect(await guess(context, 10)).not.toContain('throttled');
		expect(await guess(context, 1)).toEqual(['throttled']);
	});

	it('keeps counting after more sign-ins in one window than any walk would take', async () => {
		const stores = createMemoryStores();
		let probes = 0;
		const context = throttled({
			store: {
				...stores,
				tokens: {
					...stores.tokens,
					countAttempt: (hash, kind) => {
						probes += 1;
						return stores.tokens.countAttempt(hash, kind);
					},
				},
			},
		});
		const { auth } = context;
		await signedUp(context);

		for (let at = 0; at < 100; at += 1) {
			await auth.signIn({ email: ada.email, password });
		}
		probes = 0;
		await guess(context, 1);

		// Links 0 to 99 spent: 0, 2, 6, 14, 30, 62, 126, then halving.
		expect(probes).toBeGreaterThan(0);
		expect(probes).toBeLessThanOrEqual(16);
		expect(await guess(context, 9)).not.toContain('throttled');
		expect(await guess(context, 1)).toEqual(['throttled']);
	});

	it('counts each login apart, normalised as sign-up normalises it', async () => {
		const context = throttled();
		const { auth } = context;
		await signedUp(context);
		const other = { email: 'grace@example.test', name: 'Grace', password };
		await auth.signUp(other);

		await guess(context, 5, 'ADA@Example.test');
		await guess(context, 5, ada.email);

		expect(await guess(context, 1)).toEqual(['throttled']);
		const signedIn = await auth.signIn({ email: other.email, password });
		expect(signedIn.user.email).toBe(other.email);
	});

	it('counts a login nobody holds as it counts a registered one', async () => {
		const context = throttled();
		const nobody = 'nobody@example.test';

		expect(await guess(context, 11, nobody)).toEqual([
			...Array.from({ length: 10 }, () => 'unknownLogin'),
			'throttled',
		]);
	});

	it('compares exactly as many passwords as the limit, of twenty tried at once', async () => {
		const context = throttled();
		const { auth, compared } = context;
		await signedUp(context);
		const before = compared.count;

		const errors = await Promise.all(
			Array.from({ length: 20 }, () =>
				rejection(auth.signIn({ email: ada.email, password: 'wrong' })),
			),
		);
		const reasons = errors.map((error) => (error as { reason: string }).reason);

		expect(compared.count - before).toBe(10);
		expect(reasons.filter((reason) => reason === 'wrongPassword')).toHaveLength(
			10,
		);
		expect(reasons.filter((reason) => reason === 'throttled')).toHaveLength(10);
	});

	it('takes its limit and window from signIn.throttle', async () => {
		const context = throttled({
			signIn: { throttle: { attempts: 3, window: '1h' } },
		});
		const { auth, clock } = context;
		await signedUp(context);

		expect(await guess(context, 4)).toEqual([
			'wrongPassword',
			'wrongPassword',
			'wrongPassword',
			'throttled',
		]);
		clock.advance(WINDOW_MS);
		const refused = await rejection(
			auth.signIn({ email: ada.email, password }),
		);
		expect(refused).toMatchObject({ reason: 'throttled', retryAfter: 2700 });
	});

	it('counts nothing with signIn.throttle: false', async () => {
		const context = throttled({ signIn: { throttle: false } });
		const { auth } = context;
		const user = await signedUp(context);

		expect(await guess(context, 20)).not.toContain('throttled');
		const signedIn = await auth.signIn({ email: ada.email, password });

		expect(signedIn.user.id).toBe(user.id);
	});
});
