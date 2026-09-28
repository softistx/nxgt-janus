import { describe, expect, it } from 'bun:test';
import { mintId } from '@nxgt/janus';
import { redisPerFile } from '../test/case';
import { createRedisStores } from './stores';
import { expiresAt, session } from './stores.fixtures';

// What the adapter leaves Redis to expire, and when.

const { withCase } = redisPerFile();

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

			// A step-up moves authenticatedAt, and no expiry.
			await sessions.reauthenticateSession(record.id, new Date());
			expect(await expiryOf(`session:${record.id}`)).toBe(later.getTime());
			expect(await expiryOf(`session:token:${record.tokenHash}`)).toBe(
				later.getTime(),
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
				codeHash: null,
				attempts: 0,
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
});
