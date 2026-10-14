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

/**
 * An instance whose `revokeUserSessions` runs one queued write per call, the
 * first call of an attempt being the one before `proveFirstEmail`'s write.
 */
function racing() {
	const races: Array<() => Promise<unknown>> = [];
	const harness = setup(
		undefined,
		revoking(async () => {
			await races.shift()?.();
		}),
	);
	return { ...harness, races };
}

describe('verifyEmail.proveFirst, and a concurrent write', () => {
	it('(a) is retried once when the address stayed, and proves it with one event', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		// The squatter changes their name between the read and the write.
		races.push(() => auth.update(user, { name: 'Somebody else' }));

		const result = await auth.verifyEmail.proveFirst(user);

		expect(result.proved).toBe(true);
		expect(result.user).toMatchObject({
			emailVerified: true,
			hasPassword: false,
		});
		expect(types(received).filter((t) => t === 'user.emailVerified')).toEqual([
			'user.emailVerified',
		]);
		expect(await auth.get(user.id)).toMatchObject({
			name: 'Somebody else',
			emailVerified: true,
		});
	});

	it('(a) takes an address that only changed in case or spacing for the same', async () => {
		const { auth, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(() => auth.update(user, { email: 'ADA@example.test' }));

		expect((await auth.verifyEmail.proveFirst(user)).proved).toBe(true);
	});

	it('(b) is VERSION_CONFLICT when the address changed, and proves nothing', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(() => auth.update(user, { email: 'grace@example.test' }));

		expect(await rejection(auth.verifyEmail.proveFirst(user))).toMatchObject({
			code: 'VERSION_CONFLICT',
		});
		expect(await auth.get(user.id)).toMatchObject({
			emailVerified: false,
			hasPassword: true,
		});
		expect(types(received)).not.toContain('user.emailVerified');
	});

	it('(b2) is VERSION_CONFLICT for a bare id too when the address changed, naming both versions', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(() => auth.update(user, { email: 'grace@example.test' }));

		const error = await rejection(auth.verifyEmail.proveFirst(user.id));

		expect(error).toMatchObject({
			code: 'VERSION_CONFLICT',
			expectedVersion: user.version,
			actualVersion: user.version + 1,
		});
		expect(await auth.get(user.id)).toMatchObject({ emailVerified: false });
		expect(types(received)).not.toContain('user.emailVerified');
	});

	it('(c) answers proved: false when the write verified the e-mail', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(() => auth.verifyEmail.proveFirst(user));

		const result = await auth.verifyEmail.proveFirst(user);

		expect(result).toMatchObject({ proved: false });
		expect(result.user.emailVerified).toBe(true);
		expect(types(received).filter((t) => t === 'user.emailVerified')).toEqual([
			'user.emailVerified',
		]);
	});

	it('(d) is VERSION_CONFLICT when the retry conflicts too, and proves nothing', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(
			() => auth.update(user, { name: 'One' }),
			async () => {
				await auth.update(await auth.get(user.id), { name: 'Two' });
			},
		);

		expect(await rejection(auth.verifyEmail.proveFirst(user))).toMatchObject({
			code: 'VERSION_CONFLICT',
		});
		expect(await auth.get(user.id)).toMatchObject({
			emailVerified: false,
			hasPassword: true,
		});
		expect(types(received)).toEqual(['user.created']);
	});

	it('(e) is USER_INACTIVE when the user was deactivated between the attempts', async () => {
		const { auth, received, races } = racing();
		const { user } = await auth.signUp({ ...ada, password });
		races.push(() => auth.setActive(user, false));

		expect(await rejection(auth.verifyEmail.proveFirst(user))).toMatchObject({
			code: 'USER_INACTIVE',
		});
		expect(types(received)).not.toContain('user.emailVerified');
	});
});
