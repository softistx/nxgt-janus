import { describe, expect, it } from 'bun:test';
import { ada, password, setup } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

const next = 'brand new password';

/** The code a confirmation of `token` is refused with, or `'reset'`. */
async function confirming(
	auth: ReturnType<typeof setup>['auth'],
	token: string,
): Promise<unknown> {
	return auth.resetPassword.confirm(token, 'another new password').then(
		() => 'reset',
		(error: { code?: unknown }) => error.code,
	);
}

describe('resetPassword: an older link', () => {
	it('is spent once a later one resets the password', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.resetPassword.request(ada.email);
		const second = await auth.resetPassword.request(ada.email);

		await auth.resetPassword.confirm(second?.token ?? '', next);

		expect(await confirming(auth, first?.token ?? '')).toBe('TOKEN_SPENT');
		await auth.signIn({ email: ada.email, password: next });
	});

	it('is spent as soon as another is requested: one link alive at a time', async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const first = await auth.resetPassword.request(ada.email);
		const second = await auth.resetPassword.request(ada.email);

		expect(await confirming(auth, first?.token ?? '')).toBe('TOKEN_SPENT');
		expect(await confirming(auth, second?.token ?? '')).toBe('reset');
	});

	it('is spent when the user changes their password', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);

		await auth.changePassword(user, { current: password, next });

		expect(await confirming(auth, requested?.token ?? '')).toBe('TOKEN_SPENT');
		await auth.signIn({ email: ada.email, password: next });
	});

	it('is spent when the application sets the password', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);

		await auth.setPassword(user, next);

		expect(await confirming(auth, requested?.token ?? '')).toBe('TOKEN_SPENT');
	});

	it("leaves another user's link alone", async () => {
		const { auth } = setup();
		await auth.signUp({ ...ada, password });
		const other = { ...ada, email: 'grace@example.test' };
		await auth.signUp({ ...other, password });
		const theirs = await auth.resetPassword.request(other.email);

		await auth.resetPassword.request(ada.email);

		expect(await confirming(auth, theirs?.token ?? '')).toBe('reset');
	});

	it('is the only kind a password write adds: a sign-in code survives it', async () => {
		const { auth } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		const sent = await auth.signInCode.request(ada.email);

		await auth.changePassword(user, { current: password, next });

		const result = await auth.signInCode.confirm(
			sent?.challenge ?? '',
			sent?.code ?? '',
		);
		expect(result.status).toBe('signedIn');
	});
});

/**
 * The reference stores, where spending the user's reset links fails while
 * `broken.now` is set — every other kind is spent as usual.
 */
function failingResetSpend(): {
	store: JanusStores;
	broken: { now: boolean };
	spent: string[];
} {
	const store = createMemoryStores();
	const broken = { now: false };
	const spent: string[] = [];
	return {
		broken,
		spent,
		store: {
			...store,
			tokens: {
				...store.tokens,
				async spendUserTokens(userId, kind, at, except) {
					spent.push(kind);
					if (broken.now && kind === 'resetPassword') {
						throw new Error('connection reset');
					}
					return store.tokens.spendUserTokens(userId, kind, at, except);
				},
			},
		},
	};
}

describe('resetPassword: an outage spending the older links', () => {
	it('fails the request with STORE_FAILED, and hands out no link', async () => {
		const { store, broken } = failingResetSpend();
		const { auth } = setup({ store });
		await auth.signUp({ ...ada, password });
		broken.now = true;

		const error = await rejection(auth.resetPassword.request(ada.email));

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({
			code: 'STORE_FAILED',
			operation: 'spendUserTokens',
		});
	});

	it('fails changePassword with STORE_FAILED after the write — and the next request spends the link', async () => {
		const { store, broken, spent } = failingResetSpend();
		const { auth } = setup({ store });
		const { user } = await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);
		broken.now = true;
		spent.length = 0;

		const error = await rejection(
			auth.changePassword(user, { current: password, next }),
		);

		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		// The second-factor challenges are spent all the same.
		expect(spent).toEqual(['resetPassword', 'secondFactor']);
		// The password was written before the spend failed: the caller is
		// told, never answered as if all went well.
		await auth.signIn({ email: ada.email, password: next });
		broken.now = false;
		await auth.resetPassword.request(ada.email);
		expect(await confirming(auth, requested?.token ?? '')).toBe('TOKEN_SPENT');
	});

	it('fails setPassword and confirm with STORE_FAILED', async () => {
		const { store, broken } = failingResetSpend();
		const { auth } = setup({ store });
		const { user } = await auth.signUp({ ...ada, password });
		const requested = await auth.resetPassword.request(ada.email);
		broken.now = true;

		expect(await rejection(auth.setPassword(user, next))).toMatchObject({
			code: 'STORE_FAILED',
		});
		expect(
			await rejection(auth.resetPassword.confirm(requested?.token ?? '', next)),
		).toMatchObject({ code: 'STORE_FAILED' });
	});
});
