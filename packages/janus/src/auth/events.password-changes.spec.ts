import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { ada, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import { StoreFailure } from '../errors/janus-error';
import { setup, types } from './events.fixtures';
import { createMemoryStores } from './port/memory';

describe('user.passwordChanged', () => {
	it('reports a change and a set, named by id alone, at the time each was written', async () => {
		const { auth, clock, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		clock.advance(60_000);
		const changed = await auth.changePassword(user, {
			current: password,
			next: 'a new password',
		});
		clock.advance(60_000);
		const set = await auth.setPassword(user, 'another password');

		expect(types(received)).toEqual([
			'user.created',
			'user.passwordChanged',
			'user.passwordChanged',
		]);
		expect(received.slice(1)).toEqual([
			{
				id: expect.any(String),
				type: 'user.passwordChanged',
				occurredAt: changed.updatedAt,
				userId: user.id,
				userType: 'user',
			},
			{
				id: expect.any(String),
				type: 'user.passwordChanged',
				occurredAt: set.updatedAt,
				userId: user.id,
				userType: 'user',
			},
		]);
		const written = JSON.stringify(received);
		for (const secret of [ada.email, password, 'a new password']) {
			expect(written).not.toContain(secret);
		}
	});

	it('reports a first password set on a user created without one', async () => {
		const { auth, received } = setup();
		const user = await auth.create(ada);

		await auth.setPassword(user, 'a first password');

		expect(types(received)).toEqual(['user.created', 'user.passwordChanged']);
	});

	it('is not sent by a reset, which is user.passwordReset alone', async () => {
		const { auth, received } = setup();
		await auth.signUp({ ...ada, password });

		const reset = await auth.resetPassword.request(ada.email);
		await auth.resetPassword.confirm(reset?.token ?? '', 'a new password');

		expect(types(received)).not.toContain('user.passwordChanged');
		expect(types(received)).toContain('user.passwordReset');
	});

	it('reports nothing for a change refused: the current password is wrong', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		await rejection(
			auth.changePassword(user, { current: 'wrong', next: 'a new password' }),
		);

		expect(types(received)).toEqual(['user.created']);
	});

	it('spends the reset links before the listener hears of the change', async () => {
		let spent: unknown = 'not called';
		const { auth } = setup(async (event) => {
			if (event.type === 'user.passwordChanged') {
				spent = await rejection(
					auth.resetPassword.confirm(link, 'an older plan'),
				);
			}
		});
		const { user } = await auth.signUp({ ...ada, password });
		const link = (await auth.resetPassword.request(ada.email))?.token ?? '';

		await auth.setPassword(user, 'a new password');

		expect(spent).toMatchObject({ code: 'TOKEN_SPENT' });
	});

	it('is still reported when an outage stops what the write ends: a retry would not write again', async () => {
		const store = createMemoryStores();
		const { auth, received } = setup(undefined, {
			...store,
			tokens: {
				...store.tokens,
				async spendUserTokens() {
					throw new StoreFailure('tokens down', { cause: null });
				},
			},
		});
		const { user } = await auth.signUp({ ...ada, password });

		await rejection(auth.setPassword(user, 'a new password'));

		expect(types(received)).toEqual(['user.created', 'user.passwordChanged']);
	});
});

describe('a user.passwordChanged listener that fails', () => {
	const warnings: (Error & { code?: string })[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});

	it('fails no change: the password is written, and the failure is a warning', async () => {
		const { auth } = setup((event) => {
			if (event.type === 'user.passwordChanged') throw new Error('down');
		});
		const { user } = await auth.signUp({ ...ada, password });

		await auth.changePassword(user, {
			current: password,
			next: 'a new password',
		});
		await new Promise((resolve) => setImmediate(resolve));

		await auth.signIn({ email: ada.email, password: 'a new password' });
		expect(warnings.map((warning) => warning.code)).toEqual([
			'JANUS_EVENT_FAILED',
		]);
		expect(warnings[0]?.message).toContain('user.passwordChanged');
	});
});
