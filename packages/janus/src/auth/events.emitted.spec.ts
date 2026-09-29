import { describe, expect, it } from 'bun:test';
import { ada, bearer, clinic, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import type { UserEvent } from './events';
import { setup, types } from './events.fixtures';
import { createMemoryStores } from './port/memory';

describe('user events', () => {
	it('reports a user created, by create and by signUp, named by id alone', async () => {
		const { auth, clock, received } = setup();

		const created = await auth.create({ ...ada, email: 'bob@example.test' });
		const { user } = await auth.signUp({ ...ada, password });

		expect(received).toEqual([
			{
				id: expect.any(String),
				type: 'user.created',
				occurredAt: clock.now(),
				userId: created.id,
				userType: 'user',
			},
			{
				id: expect.any(String),
				type: 'user.created',
				occurredAt: clock.now(),
				userId: user.id,
				userType: 'user',
			},
		]);
		expect(received[0]?.id).not.toBe(received[1]?.id);
		expect(Object.isFrozen(received[0])).toBe(true);
		// Nothing a reader could sign in with, or tell who the user is by.
		const written = JSON.stringify(received);
		for (const secret of [ada.email, 'bob@example.test', ada.name, password]) {
			expect(written).not.toContain(secret);
		}
	});

	it('reports an e-mail verified once, whichever flow proved it', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const sent = await auth.verifyEmail.send(user);
		await auth.verifyEmail.confirm(sent.token);
		const again = await auth.verifyEmail.send(user);
		await auth.verifyEmail.confirm(again.token); // already verified

		expect(types(received)).toEqual(['user.created', 'user.emailVerified']);
	});

	it('reports the e-mail a sign-in code proved, and the password it dropped', async () => {
		const { auth, received } = setup();
		await auth.signUp({ ...ada, password });

		for (const _ of [1, 2]) {
			const issued = await auth.signInCode.request(ada.email);
			await auth.signInCode.confirm(
				issued?.challenge ?? '',
				issued?.code ?? '',
			);
		}

		// The first proof drops the password; the second changes nothing.
		expect(types(received)).toEqual([
			'user.created',
			'user.emailVerified',
			'user.passwordChanged',
		]);
	});

	it('reports a password reset, and the e-mail its link proved', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		const reset = await auth.resetPassword.request(ada.email);
		await auth.resetPassword.confirm(reset?.token ?? '', 'a new password');

		expect(types(received)).toEqual([
			'user.created',
			'user.passwordReset',
			'user.emailVerified',
		]);
		expect(received.at(-1)?.userId).toBe(user.id);
	});

	it('reports a user deleted once — a replay deleted nobody', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		await auth.delete(user);
		await auth.delete(user);

		expect(types(received)).toEqual(['user.created', 'user.deleted']);
		expect(received.at(-1)).toMatchObject({
			userId: user.id,
			userType: 'user',
		});
	});

	it('reports nothing for a refused flow', async () => {
		const { auth, received } = setup();
		await auth.signUp({ ...ada, password });

		await rejection(auth.signUp({ ...ada, password }));
		await rejection(auth.verifyEmail.confirm('forged'));
		await rejection(auth.resetPassword.confirm('forged', 'a new password'));

		expect(types(received)).toEqual(['user.created']);
	});

	it('awaits the listener before the flow answers', async () => {
		const order: string[] = [];
		const { auth } = setup(async () => {
			await new Promise((resolve) => setTimeout(resolve, 5));
			order.push('listener');
		});

		await auth.create(ada);
		order.push('answered');

		expect(order).toEqual(['listener', 'answered']);
	});

	it('reports the time each write landed, not the time the listener ran', async () => {
		const store = createMemoryStores();
		// Time passes during every write, and after it.
		const later = () => clock.advance(60_000);
		const { auth, clock, received } = setup(undefined, {
			...store,
			users: {
				...store.users,
				async insertUser(record) {
					const inserted = await store.users.insertUser(record);
					later();
					return inserted;
				},
				async updateUser(...args) {
					const written = await store.users.updateUser(...args);
					later();
					return written;
				},
				async deleteUser(id) {
					later();
					return store.users.deleteUser(id);
				},
			},
		});
		const last = () => received.at(-1)?.occurredAt;

		const { user } = await auth.signUp({ ...ada, password });
		expect(last()).toEqual(user.createdAt);

		const sent = await auth.verifyEmail.send(user);
		const verified = await auth.verifyEmail.confirm(sent.token);
		expect(last()).toEqual(verified.updatedAt);

		const reset = await auth.resetPassword.request(ada.email);
		const renewed = await auth.resetPassword.confirm(
			reset?.token ?? '',
			'a new password',
		);
		expect(last()).toEqual(renewed.updatedAt);

		const bob = await auth.create({ email: 'bob@example.test', name: 'Bob' });
		const issued = await auth.signInCode.request('bob@example.test');
		const coded = await auth.signInCode.confirm(
			issued?.challenge ?? '',
			issued?.code ?? '',
		);
		expect(coded.user.id).toBe(bob.id);
		expect(last()).toEqual(coded.user.updatedAt);

		const before = clock.now();
		await auth.delete(user);
		expect(last()).toEqual(before);
		expect(last()).not.toEqual(clock.now());
	});

	it('hands the listener its own Date: mutating it rewrites nothing the flow answers', async () => {
		const { auth } = setup((event) => {
			event.occurredAt.setTime(0);
		});

		const { user } = await auth.signUp({ ...ada, password });

		expect(user.createdAt.getTime()).not.toBe(0);
	});

	it('signs out whoever had the old password before the listener hears of a reset', async () => {
		let seen: unknown = 'not called';
		const { auth } = setup(async (event) => {
			if (event.type === 'user.passwordReset') {
				seen = await auth.authenticate(bearer(token));
			}
		});
		const { token } = await auth.signUp({ ...ada, password });

		const reset = await auth.resetPassword.request(ada.email);
		await auth.resetPassword.confirm(reset?.token ?? '', 'a new password');

		expect(seen).toBeNull();
	});

	it('names the user type, and reports nothing for a delete given another type', async () => {
		const received: UserEvent[] = [];
		const { auth } = clinic({ events: (event) => void received.push(event) });
		const { user } = await auth.staff.signUp({
			username: 'grace',
			service: 'navy',
			password,
		});

		expect(await auth.patient.delete(user)).toBe(false);

		expect(received).toEqual([
			expect.objectContaining({ type: 'user.created', userType: 'staff' }),
		]);
	});
});
