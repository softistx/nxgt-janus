import { describe, expect, it } from 'bun:test';
import { z } from 'zod';
import { ada, hasher, password, person } from '../../../test/auth';
import { rejection } from '../../../test/rejection';
import { StoreConflict } from '../../errors/janus-error';
import { fixedClock } from '../../time/clock';
import { janus } from '../janus';
import { recording } from '../mail-requests.fixtures';
import { createMemoryStores } from '../port/memory';
import type { JanusStores } from '../port/types';
import { setupPrepared } from './sign-up.prepare.fixtures';

describe('signUp.prepare, guards', () => {
	it('makes the same store calls, reads included, for a new address and a taken one', async () => {
		const fresh = recording();
		const held = recording();
		const wire = (store: JanusStores) =>
			janus({
				user: person,
				password: { login: 'email' },
				store,
				hasher,
				clock: fixedClock(Date.UTC(2026, 8, 23)),
			});
		const taken = wire(held.store);
		await taken.create({ ...ada, password });
		held.calls.length = 0;

		await wire(fresh.store).signUp.prepare({ ...ada, password });
		await taken.signUp.prepare({ ...ada, password });

		expect(held.calls).toEqual(fresh.calls);
		// Nothing but the count: no user was read.
		expect(held.calls.some((call) => call.startsWith('users.'))).toBe(false);
	});

	it('refuses a type whose login is not its e-mail', async () => {
		const auth = janus({
			user: z.object({ email: z.email(), handle: z.string() }),
			password: { login: 'handle' },
			store: createMemoryStores(),
			hasher,
		});
		const prepare = (
			auth as unknown as {
				signUp: { prepare(input: unknown): Promise<unknown> };
			}
		).signUp.prepare;

		expect(
			await rejection(prepare({ email: ada.email, handle: 'ada', password })),
		).toBeInstanceOf(TypeError);
	});

	it('writes a copy taken in prepare, without an `active` the visitor sent', async () => {
		const { auth } = setupPrepared();
		const input: Record<string, unknown> = {
			...ada,
			password,
			active: false,
		};
		const pending = await auth.signUp.prepare(
			input as typeof input & { email: string; name: string; password: string },
		);
		input['name'] = 'Changed after prepare';

		const outcome = await pending.send();

		if (outcome.status !== 'created') throw new Error('expected created');
		expect(outcome.user).toMatchObject({ name: ada.name, active: true });
	});
});

describe('signUp.prepare, a login already held', () => {
	it('finds the holder by e-mail when the login is normalised differently', async () => {
		const auth = janus({
			user: person,
			password: { login: 'email', normalize: 'none' },
			store: createMemoryStores(),
			hasher,
			clock: fixedClock(Date.UTC(2026, 8, 23)),
		});
		const first = await auth.create({ ...ada, password });

		const outcome = await (
			await auth.signUp.prepare({
				...ada,
				email: 'ADA@example.test',
				password,
			})
		).send();

		expect(outcome).toMatchObject({
			status: 'taken',
			user: { id: first.id },
		});
	});

	it('rethrows LOGIN_TAKEN when the holder is gone since the conflict', async () => {
		const memory = createMemoryStores();
		const store: JanusStores = {
			...memory,
			users: {
				...memory.users,
				async insertUser() {
					throw new StoreConflict('login', 'taken');
				},
				async findUserByLogin() {
					return null;
				},
			},
		};
		const auth = janus({
			user: person,
			password: { login: 'email' },
			store,
			hasher,
		});
		const pending = await auth.signUp.prepare({ ...ada, password });

		expect(await rejection(pending.send())).toMatchObject({
			code: 'LOGIN_TAKEN',
		});
	});
});
