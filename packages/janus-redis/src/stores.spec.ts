import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
	createMemoryStores,
	janus,
	mintId,
	type SessionRecord,
	StoreFailure,
	scryptHasher,
} from '@nxgt/janus';
import { z } from 'zod';
import { openCase, type RedisCase } from '../test/case';
import { startRedis, type TestServer } from '../test/server';
import { createRedisStores } from './stores';

let server: TestServer;

beforeAll(async () => {
	server = await startRedis();
}, 300_000);

afterAll(async () => {
	await server.stop();
});

/** Runs `body` against a case of its own, closed whatever happens. */
async function withCase(body: (test: RedisCase) => Promise<void>) {
	const test = await openCase(server);
	try {
		await body(test);
	} finally {
		await test.close();
	}
}

const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

function session(overrides: Partial<SessionRecord> = {}): SessionRecord {
	return {
		id: mintId(),
		tokenHash: mintId().replaceAll('-', ''),
		userId: mintId(),
		authenticatedAt: new Date(),
		expiresAt,
		revokedAt: null,
		createdAt: new Date(),
		...overrides,
	};
}

describe('createRedisStores(), beyond the port suite', () => {
	it('expires a session and its token key in Redis, at the session expiry', () =>
		withCase(async ({ redis, prefix }) => {
			const record = session();
			const { sessions } = createRedisStores(redis, { prefix });
			await sessions.insertSession(record);

			const expiryOf = (key: string) =>
				redis.client.send('PEXPIRETIME', [`${prefix}${key}`]);
			expect(await expiryOf(`session:${record.id}`)).toBe(expiresAt.getTime());
			expect(await expiryOf(`session:token:${record.tokenHash}`)).toBe(
				expiresAt.getTime(),
			);

			const later = new Date(expiresAt.getTime() + 60_000);
			await sessions.extendSession(record.id, later);
			expect(await expiryOf(`session:${record.id}`)).toBe(later.getTime());
		}));

	it('answers after Redis forgot its scripts: a restart, a failover, SCRIPT FLUSH', () =>
		withCase(async ({ redis, prefix }) => {
			const record = session();
			const { sessions } = createRedisStores(redis, { prefix });
			await sessions.insertSession(record);

			await server.admin.send('SCRIPT', ['FLUSH']);

			expect(await sessions.findSessionByTokenHash(record.tokenHash)).toEqual(
				record,
			);
		}));

	it('fails, never answers null, on a key of its prefix it did not write', () =>
		withCase(async ({ redis, prefix }) => {
			const { sessions } = createRedisStores(redis, { prefix });
			await redis.client.send('SET', [`${prefix}session:token:abc`, 's1']);
			await redis.client.send('HSET', [
				`${prefix}session:s1`,
				'expiresAt',
				'soon',
			]);

			const outcome = await sessions.findSessionByTokenHash('abc').then(
				() => 'resolved',
				(error: unknown) => error,
			);
			expect(outcome).toBeInstanceOf(StoreFailure);
			expect(outcome).toMatchObject({
				code: 'STORE_FAILED',
				slot: 'sessions',
				operation: 'findSessionByTokenHash',
			});
		}));

	it('fails on a hash missing a field, rather than filling it in', () =>
		withCase(async ({ redis, prefix }) => {
			const { tokens } = createRedisStores(redis, { prefix });
			await redis.client.send('HSET', [
				`${prefix}token:abc`,
				'kind',
				'verifyEmail',
				'spentAt',
				'',
			]);

			const outcome = await tokens
				.consumeToken('abc', 'verifyEmail', new Date())
				.then(
					() => 'resolved',
					(error: unknown) => error,
				);
			expect(outcome).toMatchObject({
				code: 'STORE_FAILED',
				slot: 'tokens',
				operation: 'consumeToken',
			});
		}));

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

	it("keeps a user's set of sessions as long as their longest session", () =>
		withCase(async ({ redis, prefix }) => {
			const { sessions } = createRedisStores(redis, { prefix });
			const userId = mintId();
			await sessions.insertSession(session({ userId }));
			await sessions.insertSession(
				session({ userId, expiresAt: new Date(Date.now() + 60_000) }),
			);

			expect(
				await redis.client.send('PEXPIRETIME', [
					`${prefix}user:${userId}:sessions`,
				]),
			).toBe(expiresAt.getTime());
		}));

	it("drops the sessions and tokens Redis expired from a user's sets", () =>
		withCase(async ({ redis, prefix }) => {
			const { sessions, tokens } = createRedisStores(redis, { prefix });
			const userId = mintId();
			const lapsedAt = new Date(Date.now() - 1000);
			const members = (set: string) =>
				redis.client.send('SMEMBERS', [`${prefix}user:${userId}:${set}`]);

			// A lapsed session joins the set of a user who has a standing one,
			// and Redis deletes its key at once.
			const standing = session({ userId });
			const lapsed = session({ userId, expiresAt: lapsedAt });
			await sessions.insertSession(standing);
			await sessions.insertSession(lapsed);
			expect(await members('sessions')).toContain(lapsed.id);

			// The next insert drops it.
			const next = session({ userId });
			await sessions.insertSession(next);
			expect((await members('sessions')) as string[]).toEqual(
				expect.arrayContaining([standing.id, next.id]),
			);
			expect(await members('sessions')).toHaveLength(2);

			// So does revoking the user's sessions.
			await sessions.insertSession(session({ userId, expiresAt: lapsedAt }));
			expect(await sessions.revokeUserSessions(userId, new Date())).toBe(2);
			expect(await members('sessions')).toHaveLength(2);

			// And the same for tokens.
			const token = (hash: string, at: Date) => ({
				tokenHash: hash,
				kind: 'verifyEmail' as const,
				userId,
				address: 'ada@example.test',
				expiresAt: at,
				spentAt: null,
				createdAt: new Date(),
			});
			await tokens.insertToken(token('t1', expiresAt));
			await tokens.insertToken(token('t2', lapsedAt));
			await tokens.insertToken(token('t3', expiresAt));
			expect(((await members('tokens')) as string[]).sort()).toEqual([
				't1',
				't3',
			]);
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
