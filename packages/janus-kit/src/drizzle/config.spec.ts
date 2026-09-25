import { describe, expect, it } from 'bun:test';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { RedisConnection } from '@nxgt/redis';
import { defineConfig } from './config';
import { connectKit } from './connect';

const db = {} as PgDatabase;
const connection = {} as RedisConnection;
const auth = () => ({});

/** Calls `defineConfig` with what the types would refuse, as JavaScript can. */
function refused(config: unknown): string {
	try {
		defineConfig(config as Parameters<typeof defineConfig>[0]);
	} catch (error) {
		expect(error).toBeInstanceOf(TypeError);
		return (error as Error).message;
	}
	throw new Error('defineConfig accepted it');
}

describe('defineConfig()', () => {
	it('answers the configuration, frozen, and connects to nothing', () => {
		const config = defineConfig({
			postgres: { url: 'postgres://nowhere.invalid/janus' },
			redis: { url: 'redis://nowhere.invalid' },
			auth,
		});
		expect(Object.isFrozen(config)).toBe(true);
		expect(config.postgres.url).toBe('postgres://nowhere.invalid/janus');
	});

	it('refuses a configuration without postgres, or with both of its sources', () => {
		expect(refused({ auth })).toContain('`postgres` is required');
		expect(refused({ postgres: {}, auth })).toBe(
			'defineConfig: `postgres` needs url or db.',
		);
		expect(refused({ postgres: { url: 'postgres://x', db }, auth })).toBe(
			'defineConfig: `postgres` has both url and db. Pass one.',
		);
		expect(refused({ postgres: { url: '' }, auth })).toBe(
			'defineConfig: `postgres.url` is a non-empty string.',
		);
	});

	it('refuses a URL Bun would open as another database, naming only its scheme', () => {
		expect(
			refused({ postgres: { url: 'mysql://root:s3cret@db/janus' }, auth }),
		).toBe(
			'defineConfig: `postgres.url` is a postgres:// or postgresql:// URL, not mysql://.',
		);
		expect(refused({ postgres: { url: ':memory:' }, auth })).toBe(
			'defineConfig: `postgres.url` is a postgres:// or postgresql:// URL.',
		);
		defineConfig({ postgres: { url: 'postgresql://localhost/janus' }, auth });
	});

	it('refuses a redis with both sources, options beside a connection, or an empty prefix', () => {
		const postgres = { db };
		expect(
			refused({ postgres, redis: { url: 'redis://x', connection }, auth }),
		).toBe('defineConfig: `redis` has both url and connection. Pass one.');
		expect(
			refused({
				postgres,
				redis: { connection, clientOptions: { tls: true } },
				auth,
			}),
		).toContain('`redis.clientOptions` beside `redis.connection`');
		expect(
			refused({ postgres, redis: { url: 'redis://x', prefix: '' }, auth }),
		).toBe('defineConfig: `redis.prefix` is a non-empty string.');
		expect(refused({ postgres, redis: 'redis://x', auth })).toBe(
			'defineConfig: `redis` is { url } or { connection }, or absent to keep sessions in PostgreSQL.',
		);
	});

	it('refuses auth or access that are not functions, and a telemetry that is not a boolean', () => {
		const postgres = { db };
		expect(refused({ postgres })).toContain('`auth` is required');
		expect(refused({ postgres, auth, access: {} })).toContain(
			'`access` is ({ relations, auth })',
		);
		expect(refused({ postgres, auth, telemetry: 'yes' })).toBe(
			'defineConfig: `telemetry` is true or false.',
		);
	});
});

describe('connectKit(), given a configuration defineConfig never saw', () => {
	it('checks it again, before Bun could read DATABASE_URL for a missing URL', async () => {
		const outcome = await connectKit({
			postgres: {} as { url: string },
			auth,
		}).then(
			() => 'resolved',
			(error: Error) => `${error.name}: ${error.message}`,
		);
		expect(outcome).toBe('TypeError: connectKit: `postgres` needs url or db.');
	});
});
