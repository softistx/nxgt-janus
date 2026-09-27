import { describe, expect, it } from 'bun:test';
import { mintId, StoreFailure } from '@nxgt/janus';
import { redisPerFile } from '../test/case';
import { createRedisStores } from './stores';
import { expiresAt, session } from './stores.fixtures';

// What the adapter reads back after Redis forgot its scripts, and from keys
// it did not write, or wrote in an earlier version: never an answer made up.

const served = redisPerFile();
const { withCase } = served;

describe('createRedisStores(), beyond the port suite', () => {
	it('answers after Redis forgot its scripts: a restart, a failover, SCRIPT FLUSH', () =>
		withCase(async ({ redis, prefix }) => {
			const record = session();
			const { sessions } = createRedisStores(redis, { prefix });
			await sessions.insertSession(record);

			await served.server.admin.send('SCRIPT', ['FLUSH']);

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

	it('reads a token written before 0.2 as no code and no attempts, then counts it', () =>
		withCase(async ({ redis, prefix }) => {
			const { tokens } = createRedisStores(redis, { prefix });
			await tokens.insertToken({
				tokenHash: 'legacy',
				kind: 'resetPassword',
				userId: mintId(),
				address: 'ada@example.test',
				codeHash: null,
				attempts: 0,
				expiresAt,
				spentAt: null,
				createdAt: new Date(),
			});
			await redis.client.send('HDEL', [
				`${prefix}token:legacy`,
				'codeHash',
				'attempts',
			]);

			expect(
				await tokens.countAttempt('legacy', 'resetPassword'),
			).toMatchObject({ codeHash: null, attempts: 1 });
		}));

	it('fails on an attempt count it did not write, rather than reading it as a number', () =>
		withCase(async ({ redis, prefix }) => {
			const { tokens } = createRedisStores(redis, { prefix });
			await tokens.insertToken({
				tokenHash: 'odd',
				kind: 'resetPassword',
				userId: mintId(),
				address: 'ada@example.test',
				codeHash: null,
				attempts: 0,
				expiresAt,
				spentAt: null,
				createdAt: new Date(),
			});
			for (const odd of ['1e1', '0x10', '', '-1', '01']) {
				await redis.client.send('HSET', [
					`${prefix}token:odd`,
					'attempts',
					odd,
				]);
				const outcome = await tokens
					.consumeToken('odd', 'resetPassword', new Date())
					.then(
						() => 'resolved',
						(error: unknown) => error,
					);
				expect(outcome).toMatchObject({
					code: 'STORE_FAILED',
					operation: 'consumeToken',
				});
			}
		}));
});
