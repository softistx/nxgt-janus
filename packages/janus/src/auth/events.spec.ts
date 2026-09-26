import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { ada, hasher, password, person, rejection } from '../../test/auth';
import { fixedClock } from '../time/clock';
import type { UserEvent, UserEventListener } from './events';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';

function setup(events?: UserEventListener) {
	const clock = fixedClock(Date.UTC(2026, 8, 26));
	const received: UserEvent[] = [];
	const auth = janus({
		user: person,
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher,
		clock,
		events:
			events ??
			((event) => {
				received.push(event);
			}),
	});
	return { auth, clock, received };
}

const types = (events: readonly UserEvent[]) => events.map((e) => e.type);

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

	it('reports the e-mail a sign-in code proved', async () => {
		const { auth, received } = setup();
		await auth.signUp({ ...ada, password });

		for (const _ of [1, 2]) {
			const issued = await auth.signInCode.request(ada.email);
			await auth.signInCode.confirm(
				issued?.challenge ?? '',
				issued?.code ?? '',
			);
		}

		expect(types(received)).toEqual(['user.created', 'user.emailVerified']);
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

describe('janus({ events })', () => {
	it('refuses a listener that is not a function', () => {
		expect(() =>
			janus({
				user: person,
				store: createMemoryStores(),
				// @ts-expect-error events is a function
				events: { 'user.created': () => {} },
			}),
		).toThrow(
			'janus: events must be a function that takes a user event — webhooks({ … }) from @nxgt/janus-webhooks, or your own',
		);
	});
});
