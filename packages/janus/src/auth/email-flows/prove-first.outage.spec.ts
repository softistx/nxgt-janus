import { describe, expect, it } from 'bun:test';
import { ada, bearer, password } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreFailure } from '../../errors/janus-error';
import { setup, types } from '../events.fixtures';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';

/** The reference stores, with `revokeUserSessions` running `before` on its every call. */
function revoking(before: () => Promise<void> | void) {
	const store = createMemoryStores();
	const wrapped: JanusStores = {
		...store,
		sessions: {
			...store.sessions,
			async revokeUserSessions(userId, at, except) {
				await before();
				return store.sessions.revokeUserSessions(userId, at, except);
			},
		},
	};
	return wrapped;
}

describe('verifyEmail.proveFirst, and an outage', () => {
	it('reading the user is STORE_FAILED, and nothing is proved', async () => {
		const store = createMemoryStores();
		let down = false;
		const { auth, received } = setup(undefined, {
			...store,
			users: {
				...store.users,
				async findUser(id) {
					if (down) throw new Error('connect ECONNREFUSED');
					return store.users.findUser(id);
				},
			},
		});
		const { user } = await auth.signUp({ ...ada, password });
		down = true;

		const error = await rejection(auth.verifyEmail.proveFirst(user));

		expect(error).toBeInstanceOf(StoreFailure);
		expect(error).toMatchObject({ code: 'STORE_FAILED' });
		down = false;
		expect((await auth.get(user.id)).emailVerified).toBe(false);
		expect(types(received)).toEqual(['user.created']);
	});

	it('before the write is STORE_FAILED and proves nothing, so a retry proves', async () => {
		let failing = false;
		const { auth, received } = setup(
			undefined,
			revoking(() => {
				if (failing) throw new StoreFailure('sessions down', { cause: null });
			}),
		);
		const squatter = await auth.signUp({ ...ada, password });
		failing = true;

		expect(
			await rejection(auth.verifyEmail.proveFirst(squatter.user)),
		).toMatchObject({ code: 'STORE_FAILED' });
		expect((await auth.get(squatter.user.id)).emailVerified).toBe(false);
		expect(types(received)).toEqual(['user.created']);

		failing = false;
		expect((await auth.verifyEmail.proveFirst(squatter.user)).proved).toBe(
			true,
		);
		expect(await auth.authenticate(bearer(squatter.token))).toBeNull();
	});
});

describe('verifyEmail.proveFirst, and a concurrent write', () => {
	it('is VERSION_CONFLICT when the user changed since it was read, and proves nothing', async () => {
		let race: (() => Promise<unknown>) | null = null;
		const { auth, received } = setup(
			undefined,
			revoking(async () => {
				const write = race;
				race = null;
				await write?.();
			}),
		);
		const { user } = await auth.signUp({ ...ada, password });
		// The squatter changes their name between the read and the write.
		race = () => auth.update(user, { name: 'Somebody else' });

		expect(await rejection(auth.verifyEmail.proveFirst(user))).toMatchObject({
			code: 'VERSION_CONFLICT',
		});
		expect(await auth.get(user.id)).toMatchObject({
			emailVerified: false,
			hasPassword: true,
		});
		expect(types(received)).toEqual(['user.created']);
	});
});
