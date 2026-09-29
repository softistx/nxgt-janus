import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { StoreFailure } from '../errors/janus-error';
import { setup, types } from './events.fixtures';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

/** The reference stores, with the `nth` call to `revokeUserSessions` failing. */
function failingRevoke(nth: number): JanusStores {
	const store = createMemoryStores();
	let calls = 0;
	return {
		...store,
		sessions: {
			...store.sessions,
			async revokeUserSessions(userId, at, except) {
				calls += 1;
				if (calls === nth) {
					throw new StoreFailure('sessions down', { cause: null });
				}
				return store.sessions.revokeUserSessions(userId, at, except);
			},
		},
	};
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
});
