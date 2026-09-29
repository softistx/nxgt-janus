import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { enrolled, setup as withFactor } from '../../test/second-factor';
import { StoreFailure } from '../errors/janus-error';
import { setup, types } from './events.fixtures';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

/**
 * The reference stores, with the `nth` call to `revokeUserSessions` failing —
 * counted from the first call, or from `arm()` when `armed` starts `false`.
 */
function failingRevoke(nth: number, armed = true) {
	const store = createMemoryStores();
	let calls = 0;
	let counting = armed;
	const failing: JanusStores = {
		...store,
		sessions: {
			...store.sessions,
			async revokeUserSessions(userId, at, except) {
				if (counting) calls += 1;
				if (calls === nth) {
					throw new StoreFailure('sessions down', { cause: null });
				}
				return store.sessions.revokeUserSessions(userId, at, except);
			},
		},
	};
	return Object.assign(failing, {
		arm() {
			counting = true;
		},
	});
}

/** A code requested and confirmed for Ada. */
async function confirmCode(auth: ReturnType<typeof setup>['auth']) {
	const issued = await auth.signInCode.request(ada.email);
	if (issued === null) throw new Error('expected a code');
	return auth.signInCode.confirm(issued.challenge, issued.code);
}

describe('a first proof by e-mail, and an outage', () => {
	it('before the write proves nothing, so the next code ends the squatter all the same', async () => {
		const { auth, received } = setup(undefined, failingRevoke(1));
		const squatter = await auth.signUp({ ...ada, password });

		expect(await rejection(confirmCode(auth))).toMatchObject({
			code: 'STORE_FAILED',
		});
		expect((await auth.get(squatter.user.id)).emailVerified).toBe(false);
		expect(types(received)).toEqual(['user.created']);

		expect((await confirmCode(auth)).status).toBe('signedIn');
		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
		expect(types(received)).toEqual([
			'user.created',
			'user.emailVerified',
			'user.passwordChanged',
		]);
	});

	it('after the write still reports it: the code is spent, so a retry could not', async () => {
		const { auth, received } = setup(undefined, failingRevoke(2));
		const squatter = await auth.signUp({ ...ada, password });

		expect(await rejection(confirmCode(auth))).toMatchObject({
			code: 'STORE_FAILED',
		});

		const user = await auth.get(squatter.user.id);
		expect(user.emailVerified).toBe(true);
		expect(user.hasPassword).toBe(false);
		// The revocation before the write ended the squatter's session.
		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
		expect(types(received)).toEqual([
			'user.created',
			'user.emailVerified',
			'user.passwordChanged',
		]);
	});

	it('after the write still reports a second factor removed', async () => {
		const store = failingRevoke(2, false);
		const received: string[] = [];
		const context = withFactor({
			store,
			events: (event) => void received.push(event.type),
		});
		const { user } = await enrolled(context);
		received.length = 0;
		store.arm();

		const issued = await context.auth.magicLink.request(ada.email);
		expect(
			await rejection(context.auth.magicLink.confirm(issued?.token ?? '')),
		).toMatchObject({ code: 'STORE_FAILED' });

		expect((await context.auth.get(user.id)).hasSecondFactor).toBe(false);
		expect(received).toEqual([
			'user.emailVerified',
			'user.passwordChanged',
			'user.secondFactorDisabled',
		]);
	});
});
