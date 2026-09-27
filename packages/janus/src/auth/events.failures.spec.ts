import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { ada, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { StoreFailure } from '../errors/janus-error';
import type { UserEvent } from './events';
import { setup, types } from './events.fixtures';
import { createMemoryStores } from './port/memory';
import type { JanusStores } from './port/types';

describe('an outage after the write', () => {
	/** The reference stores, with one sessions method failing once. */
	function failingOnce(
		method: 'deleteUserSessions' | 'revokeUserSessions',
	): JanusStores {
		const store = createMemoryStores();
		let failed = false;
		const once = () => {
			if (failed) return;
			failed = true;
			throw new StoreFailure('sessions down', { cause: null });
		};
		return {
			...store,
			sessions: {
				...store.sessions,
				...(method === 'deleteUserSessions'
					? {
							async deleteUserSessions(userId) {
								once();
								return store.sessions.deleteUserSessions(userId);
							},
						}
					: {
							async revokeUserSessions(userId, at) {
								once();
								return store.sessions.revokeUserSessions(userId, at);
							},
						}),
			},
		};
	}

	it('still reports the user deleted: the replay deletes nobody, so could not', async () => {
		const { auth, received } = setup(
			undefined,
			failingOnce('deleteUserSessions'),
		);
		const { user } = await auth.signUp({ ...ada, password });

		await rejection(auth.delete(user));
		expect(await auth.delete(user)).toBe(false);

		expect(types(received)).toEqual(['user.created', 'user.deleted']);
	});

	it('still reports the reset: the link is spent, so a retry could not', async () => {
		const { auth, received } = setup(
			undefined,
			failingOnce('revokeUserSessions'),
		);
		await auth.signUp({ ...ada, password });
		const reset = await auth.resetPassword.request(ada.email);

		await rejection(
			auth.resetPassword.confirm(reset?.token ?? '', 'a new password'),
		);

		expect(types(received)).toEqual([
			'user.created',
			'user.passwordReset',
			'user.emailVerified',
		]);
	});
});

describe('a listener that fails', () => {
	const warnings: Error[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});

	it('fails no flow, and warns with what it takes to send the event again', async () => {
		let seen: UserEvent | undefined;
		const { auth } = setup((event) => {
			seen = event;
			throw new Error('queue full: ada@example.test');
		});

		const created = await auth.create(ada);
		await new Promise((resolve) => setImmediate(resolve));

		expect(created.email).toBe(ada.email);
		expect(warnings).toHaveLength(1);
		const [warning] = warnings;
		expect((warning as Error & { code?: string }).code).toBe(
			'JANUS_EVENT_FAILED',
		);
		expect(warning?.message).toContain('user.created');
		expect(warning?.message).toContain(seen?.id ?? 'no event');
		expect(warning?.message).toContain(created.id);
		// The failure's name, never its message: it may hold anything.
		expect(warning?.message).not.toContain('queue full');
	});

	it('fails no reset and no sign-in code either: the user holds what they asked for', async () => {
		const { auth } = setup((event) => {
			if (event.type !== 'user.created') throw new Error('down');
		});
		await auth.signUp({ ...ada, password });

		const reset = await auth.resetPassword.request(ada.email);
		await auth.resetPassword.confirm(reset?.token ?? '', 'a new password');
		await auth.signIn({ email: ada.email, password: 'a new password' });

		const other = await auth.signUp({
			email: 'bob@example.test',
			name: 'Bob',
			password,
		});
		const issued = await auth.signInCode.request('bob@example.test');
		const signedIn = await auth.signInCode.confirm(
			issued?.challenge ?? '',
			issued?.code ?? '',
		);
		await new Promise((resolve) => setImmediate(resolve));

		expect(signedIn.user.id).toBe(other.user.id);
		expect(signedIn.user.emailVerified).toBe(true);
		expect(warnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining('user.passwordReset'),
			expect.stringContaining('user.emailVerified'),
			expect.stringContaining('user.emailVerified'),
		]);
	});

	it('fails no flow when it rejects, either', async () => {
		const { auth } = setup(async () => {
			throw new TypeError('rejected');
		});

		const created = await auth.create(ada);
		await new Promise((resolve) => setImmediate(resolve));

		expect(created.id).toBeString();
		expect(warnings.map((warning) => warning.message)).toEqual([
			expect.stringContaining('TypeError'),
		]);
	});
});
