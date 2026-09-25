import { describe, expect, it } from 'bun:test';
import { fixedClock, janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { z } from 'zod';
import { openTestDb } from '../test/db';
import { createDrizzleAdapter } from './adapter';

describe('createDrizzleAdapter()', () => {
	it('wires both sides with one spread: deleting a user deletes their tuples', async () => {
		const test = await openTestDb();
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
				types: { note: { relations: { owner: ['user'] } } },
			}),
			store: postgres.relations,
		});
		const { user } = await auth.signUp({
			email: 'ada@example.test',
			password: 'correct horse',
		});
		const note = { type: 'note', id: 'n1' } as const;
		await access.grant(note, 'owner', user);
		expect(await access.can(user, 'owner', note)).toBe(true);

		expect(await auth.delete(user)).toBe(true);

		// The tuple went with the user: the relation store was wired into janus().
		expect(await access.can(user, 'owner', note)).toBe(false);
		await test.close();
	});

	it('collects lapsed sessions: PostgreSQL has no TTL, so collectExpired() is implemented', async () => {
		const test = await openTestDb();
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
		await test.close();
	});
});
