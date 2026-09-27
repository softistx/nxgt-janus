import { describe, expect, it } from 'bun:test';
import { janus } from '@nxgt/janus';
import { openPglite } from '../../test/postgres';
import { defineConfig } from './config';
import { connectKit } from './connect';
import { hasher, user } from './connect.fixtures';

// How connectKit() fails, and how ping() reports a database that stops
// answering: never naming a URL.

describe('connectKit()', () => {
	it('fails at connect, naming the missing tables, and closes what it opened', async () => {
		const pg = await openPglite({ migrated: false });
		try {
			const outcome = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			).then(
				() => 'resolved',
				(error: Error) => error.message,
			);
			expect(outcome).toBe(
				`connectKit: Janus's tables are missing from this database: "users", "logins", "sessions", "tokens", "relations". Apply the migration drizzle-kit generated from defineJanusTables(), to the database \`postgres\` names.`,
			);
		} finally {
			await pg.close();
		}
	});

	it('fails fast on a PostgreSQL that refuses the connection, never naming the URL', async () => {
		const started = performance.now();
		const outcome = await connectKit(
			defineConfig({
				postgres: { url: 'postgres://janus:s3cret@127.0.0.1:1/janus' },
				auth: (adapters) =>
					janus({ user, password: { login: 'email' }, hasher, ...adapters }),
			}),
		).then(
			() => 'resolved',
			(error: Error) => error.message,
		);
		expect(outcome).toBe(
			'connectKit: PostgreSQL did not answer. Check `postgres.url`, and that the database exists.',
		);
		expect(performance.now() - started).toBeLessThan(5_000);
	});

	it('fails on a Redis that does not answer, naming where sessions stay without it, and closes PostgreSQL', async () => {
		const pg = await openPglite();
		try {
			const outcome = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					redis: {
						url: 'redis://127.0.0.1:1',
						clientOptions: { autoReconnect: false, connectionTimeout: 500 },
					},
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			).then(
				() => 'resolved',
				(error: Error) => error.message,
			);
			expect(outcome).toBe(
				'connectKit: Redis did not answer. Check `redis.url`, or leave `redis` out to keep sessions in PostgreSQL.',
			);
		} finally {
			await pg.close();
		}
	});

	it('reports a database that stops answering as ok: false within timeoutMs', async () => {
		const pg = await openPglite();
		let hang = false;
		const db = new Proxy(pg.db, {
			get(target, key, receiver) {
				const value: unknown = Reflect.get(target, key, receiver);
				if (key !== 'execute' || typeof value !== 'function') return value;
				return (...args: unknown[]) =>
					hang ? new Promise(() => {}) : value.apply(target, args);
			},
		});
		try {
			await using kit = await connectKit(
				defineConfig({
					postgres: { db },
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			);
			hang = true;
			const health = await kit.ping({ timeoutMs: 50 });
			expect(health.ok).toBe(false);
			expect(health.postgres).toMatchObject({ ok: false });
			expect(String((health.postgres as { error: Error }).error.message)).toBe(
				'ping: no answer in 50ms',
			);
		} finally {
			await pg.close();
		}
	});
});
