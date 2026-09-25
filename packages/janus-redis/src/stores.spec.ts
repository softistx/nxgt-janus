import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import {
	createMemoryStores,
	janus,
	mintId,
	type SessionRecord,
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
				(error: { code?: string }) => error.code,
			);
			expect(outcome).toBe('STORE_FAILED');
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
