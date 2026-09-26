import { describe, expect, it } from 'bun:test';
import { fixedClock, janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { z } from 'zod';
import { openTestDb } from '../test/db';
import { createDrizzleAdapter } from './adapter';

describe('createDrizzleAdapter()', () => {
	it('wires both sides with one spread: deleting a user deletes their tuples', async () => {
		const test = await openTestDb();
		try {
			const postgres = createDrizzleAdapter(test.db);
			const auth = janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				hasher: scryptHasher({ cost: 10 }),
				...postgres,
			});
			const access = permissions({
				model: defineModel({
					subjects: auth.types,
					types: { note: { related: { owners: ['user'] } } },
				}),
				store: postgres.relations,
			});
			const { user } = await auth.signUp({
				email: 'ada@example.test',
				password: 'correct horse',
			});
			const note = { type: 'note', id: 'n1' } as const;
			await access.grant(note, 'owners', user);
			expect(await access.can(user, 'owners', note)).toBe(true);

			expect(await auth.delete(user)).toBe(true);

			// The tuple went with the user: the relation store was wired into janus().
			expect(await access.can(user, 'owners', note)).toBe(false);
		} finally {
			await test.close();
		}
	});

	it('collects lapsed sessions: PostgreSQL has no TTL, so collectExpired() is implemented', async () => {
		const test = await openTestDb();
		try {
			const clock = fixedClock(Date.UTC(2026, 0, 1));
			const auth = janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				session: { lifespan: '1h', renewAfter: false },
				hasher: scryptHasher({ cost: 10 }),
				clock,
				...createDrizzleAdapter(test.db),
			});
			const { token } = await auth.signUp({
				email: 'ada@example.test',
				password: 'correct horse',
			});

			expect(await auth.collectExpired()).toBe(0);
			clock.advance(60 * 60 * 1000);
			expect(await auth.collectExpired()).toBe(1);

			const request = new Request('https://x.test', {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(await auth.authenticate(request)).toBeNull();
		} finally {
			await test.close();
		}
	});
});

describe('a NUL character or a lone surrogate', () => {
	const settle = (promise: Promise<unknown>) =>
		promise.then(
			() => null,
			(error: unknown) => error as { code?: string },
		);

	it('is what PostgreSQL refuses, and janus refuses it first on every path a request reaches', async () => {
		const test = await openTestDb();
		try {
			const postgres = createDrizzleAdapter(test.db);
			const auth = janus({
				user: z.strictObject({ email: z.email(), name: z.string() }),
				password: { login: 'email' },
				hasher: scryptHasher({ cost: 10 }),
				...postgres,
			});
			const password = 'correct horse';
			const { user } = await auth.signUp({
				email: 'ada@example.test',
				name: 'Ada',
				password,
			});

			// The store itself fails on one: without the core's refusal, a 503.
			const direct = await settle(
				postgres.store.users.updateUser(
					user.id,
					{
						updatedAt: new Date(),
						fields: { email: 'ada@example.test', name: 'a\u0000b' },
					},
					user.version,
				),
			);
			expect(direct?.code).toBe('STORE_FAILED');

			for (const name of ['a\u0000b', 'a\uD800b']) {
				expect(
					(
						await settle(
							auth.signUp({ email: 'grace@example.test', name, password }),
						)
					)?.code,
				).toBe('USER_INVALID');
				expect((await settle(auth.update(user, { name })))?.code).toBe(
					'USER_INVALID',
				);
			}
			expect(
				(
					await settle(
						auth.signIn({ email: 'ada@example.test\u0000', password }),
					)
				)?.code,
			).toBe('CREDENTIALS_INVALID');
			expect(await auth.findByLogin('ada@example.test\uDC00')).toBeNull();
			expect(
				await auth.resetPassword.request('ada@example.test\u0000'),
			).toBeNull();
			expect((await auth.get(user.id)).name).toBe('Ada');
		} finally {
			await test.close();
		}
	});
});
