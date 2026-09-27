import { describe, expect, it } from 'bun:test';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { redisPerFile } from '../test/case';
import { createRedisStores } from './stores';
import { session } from './stores.fixtures';

// What the adapter answers janus() with: a token hash already held refused,
// and sessions served beside another users store.

const { withCase } = redisPerFile();

describe('createRedisStores(), beyond the port suite', () => {
	it('refuses a session token hash another session holds: not a retry', () =>
		withCase(async ({ redis, prefix }) => {
			const { sessions } = createRedisStores(redis, { prefix });
			const first = session();
			await sessions.insertSession(first);

			const outcome = await sessions
				.insertSession(session({ tokenHash: first.tokenHash }))
				.then(
					() => 'resolved',
					(error: { code?: string }) => error.code,
				);
			expect(outcome).toBe('STORE_FAILED');
			expect(await sessions.findSessionByTokenHash(first.tokenHash)).toEqual(
				first,
			);
		}));

	it('serves janus() beside another users store, and leaves collecting to Redis', () =>
		withCase(async ({ redis, prefix }) => {
			const auth = janus({
				user: z.strictObject({ email: z.email() }),
				password: { login: 'email' },
				hasher: scryptHasher({ cost: 10 }),
				store: {
					...createMemoryStores(),
					...createRedisStores(redis, { prefix }),
				},
			});
			const { token } = await auth.signUp({
				email: 'ada@example.test',
				password: 'correct horse',
			});
			const request = new Request('https://x.test', {
				headers: { authorization: `Bearer ${token}` },
			});
			expect(await auth.authenticate(request)).not.toBeNull();
			expect(await auth.signOut(request)).toBe(true);
			expect(await auth.authenticate(request)).toBeNull();

			const collected = await auth.collectExpired().then(
				() => 'resolved',
				(error: { code?: string }) => error.code,
			);
			expect(collected).toBe('UNSUPPORTED');
		}));
});
