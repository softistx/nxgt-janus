import { afterAll, afterEach, describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, clinic, hasher, password } from '../../test/auth';
import { rejection } from '../../test/rejection';
import type { UserEvent } from './events';
import { setup, types } from './events.fixtures';
import { janus } from './janus';
import { createMemoryStores } from './port/memory';

describe('user.emailChanged', () => {
	it('reports an update that changed the e-mail, with the address it replaced', async () => {
		const { auth, clock, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		clock.advance(60_000);
		const updated = await auth.update(user, { email: 'ada@new.example' });

		expect(received.at(-1)).toEqual({
			id: expect.any(String),
			type: 'user.emailChanged',
			occurredAt: updated.updatedAt,
			userId: user.id,
			userType: 'user',
			formerEmail: ada.email,
		});
		expect(Object.isFrozen(received.at(-1))).toBe(true);
		// The former address only: the new one is read from the user.
		expect(JSON.stringify(received)).not.toContain('ada@new.example');
	});

	it('carries the former address as it was stored, and nothing else on any other type', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({
			...ada,
			email: 'Ada@Example.test',
			password,
		});

		await auth.update(user, { email: 'grace@example.test' });

		expect(received.at(-1)?.formerEmail).toBe('Ada@Example.test');
		expect(received[0]).not.toHaveProperty('formerEmail');
	});

	it('reports nothing for an update that leaves the e-mail alone, or changes only its case', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });

		await auth.update(user, { name: 'Ada King' });
		await auth.update(user, { email: ada.email });
		await auth.update(user, { email: 'ADA@example.test' });

		expect(types(received)).toEqual(['user.created']);
	});

	it('reports nothing for an update refused', async () => {
		const { auth, received } = setup();
		const { user } = await auth.signUp({ ...ada, password });
		await auth.create({ email: 'bob@example.test', name: 'Bob' });

		await rejection(auth.update(user, { email: 'not an e-mail' }));
		await rejection(auth.update(user, { email: 'bob@example.test' }));
		await rejection(
			auth.update(user, { email: 'ada@new.example' }, { ifVersion: 99 }),
		);

		expect(types(received)).toEqual(['user.created', 'user.created']);
	});

	it('names the former address null when the user had none, and reports one removed', async () => {
		const received: UserEvent[] = [];
		const auth = janus({
			user: z.strictObject({
				username: z.string(),
				email: z.email().optional(),
			}),
			password: { login: 'username', normalize: 'none' },
			store: createMemoryStores(),
			hasher,
			events: (event) => void received.push(event),
		});
		const { user } = await auth.signUp({ username: 'ada', password });

		await auth.update(user, { email: 'ada@example.test' });
		await auth.update(user, { email: undefined });

		expect(received.slice(1)).toEqual([
			expect.objectContaining({ type: 'user.emailChanged', formerEmail: null }),
			expect.objectContaining({
				type: 'user.emailChanged',
				formerEmail: 'ada@example.test',
			}),
		]);
	});

	it('is never sent for a type with no e-mail', async () => {
		const received: UserEvent[] = [];
		const { auth } = clinic({ events: (event) => void received.push(event) });
		const { user } = await auth.staff.signUp({
			username: 'grace',
			service: 'navy',
			password,
		});

		await auth.staff.update(user, { username: 'hopper' });

		expect(types(received)).toEqual(['user.created']);
	});
});

describe('a user.emailChanged listener that fails', () => {
	const warnings: (Error & { code?: string })[] = [];
	const onWarning = (warning: Error) => warnings.push(warning);
	process.on('warning', onWarning);
	afterEach(() => {
		warnings.length = 0;
	});
	afterAll(() => {
		process.off('warning', onWarning);
	});

	it('fails no update, and its warning names no address', async () => {
		const { auth } = setup((event) => {
			if (event.type === 'user.emailChanged')
				throw new Error(event.formerEmail ?? '');
		});
		const { user } = await auth.signUp({ ...ada, password });

		const updated = await auth.update(user, { email: 'ada@new.example' });
		await new Promise((resolve) => setImmediate(resolve));

		expect(updated.email).toBe('ada@new.example');
		expect(warnings.map((warning) => warning.code)).toEqual([
			'JANUS_EVENT_FAILED',
		]);
		expect(warnings[0]?.message).toContain('user.emailChanged');
		expect(warnings[0]?.message).not.toContain(ada.email);
	});
});
