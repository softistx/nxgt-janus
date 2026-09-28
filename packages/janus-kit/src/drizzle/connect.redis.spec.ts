import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { janus } from '@nxgt/janus';
import { defineJanusTables } from '@nxgt/janus-drizzle';
import { connectRedis } from '@nxgt/redis';
import { openPglite } from '../../test/postgres';
import { startRedis, type TestServer } from '../../test/server';
import { defineConfig } from './config';
import { connectKit } from './connect';
import { credentials, hasher, user } from './connect.fixtures';

// What connectKit() does with a Redis: sessions and tokens kept there, and
// the connection it opened closed, whatever happens. The only file here that
// starts one.

let server: TestServer;
let redisUrl: string;

beforeAll(async () => {
	server = await startRedis();
	redisUrl = `redis://${server.host}:${server.port}`;
}, 300_000);

afterAll(async () => {
	await server.stop();
});

describe('connectKit()', () => {
	it('keeps sessions and tokens in Redis when it is wired, and closes the connection it opened', async () => {
		const pg = await openPglite();
		const prefix = `kit${Date.now()}:`;
		try {
			const kit = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					redis: { url: redisUrl, prefix },
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			);
			const { session } = await kit.auth.signUp(credentials());
			expect(
				await server.admin.send('EXISTS', [`${prefix}session:${session.id}`]),
			).toBe(1);
			expect(await pg.db.$count(defineJanusTables().sessions)).toBe(0);
			expect('access' in kit).toBe(false);

			const health = await kit.ping();
			expect(health).toMatchObject({
				ok: true,
				postgres: { ok: true },
				redis: { ok: true },
			});

			await kit.close();
			expect((await kit.ping()).redis?.ok).toBe(false);
			const afterClose = await kit.auth.signUp(credentials()).then(
				() => 'resolved',
				(error: { code?: string }) => error.code,
			);
			expect(afterClose).toBe('STORE_FAILED');
		} finally {
			await pg.close();
		}
	});

	it('throttles sign-in in Redis, and forgets the counts when Redis is flushed', async () => {
		const pg = await openPglite();
		const prefix = `kit${Date.now()}:`;
		try {
			const kit = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					redis: { url: redisUrl, prefix },
					auth: (adapters) =>
						janus({
							user,
							password: { login: 'email' },
							hasher,
							signIn: { throttle: { attempts: 2 } },
							...adapters,
						}),
				}),
			);
			const signedUp = credentials();
			await kit.auth.signUp(signedUp);
			const reasonOf = (password: string) =>
				kit.auth.signIn({ email: signedUp.email, password }).then(
					() => 'signedIn',
					(error: { reason?: string }) => error.reason,
				);

			expect(await reasonOf('wrong')).toBe('wrongPassword');
			expect(await reasonOf('wrong')).toBe('wrongPassword');
			expect(await reasonOf(signedUp.password)).toBe('throttled');

			await server.admin.send('FLUSHDB', []);
			expect(await reasonOf(signedUp.password)).toBe('signedIn');
			await kit.close();
		} finally {
			await pg.close();
		}
	});

	it("passes @nxgt/redis's refusal of a URL already connected with other options through", async () => {
		const pg = await openPglite();
		const mine = await connectRedis(redisUrl);
		try {
			const outcome = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					redis: { url: redisUrl },
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			).then(
				() => 'resolved',
				(error: Error) => `${error.name}: ${error.message}`,
			);
			expect(outcome).toStartWith(
				'TypeError: connectRedis: this URI is already connected with other options.',
			);
		} finally {
			await mine.close();
			await pg.close();
		}
	});

	it('closes the Redis connection it opened when auth throws', async () => {
		const pg = await openPglite();
		const clients = async () =>
			String(await server.admin.send('CLIENT', ['LIST']))
				.trim()
				.split('\n').length;
		try {
			const before = await clients();
			const outcome = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					redis: { url: redisUrl },
					auth: () => {
						throw new Error('auth failed');
					},
				}),
			).then(
				() => 'resolved',
				(error: Error) => error.message,
			);
			expect(outcome).toBe('auth failed');
			expect(await clients()).toBe(before);
		} finally {
			await pg.close();
		}
	});
});
