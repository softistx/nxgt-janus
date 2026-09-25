import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { defineJanusTables } from '@nxgt/janus-drizzle';
import { connectRedis } from '@nxgt/redis';
import { SQL } from 'bun';
import { pgSchema } from 'drizzle-orm/pg-core';
import { z } from 'zod';
import { janusDdl, openPglite } from '../test/postgres';
import { startRedis, type TestServer } from '../test/server';
import { defineConfig } from './config';
import { connectKit } from './connect';

let server: TestServer;
let redisUrl: string;

beforeAll(async () => {
	server = await startRedis();
	redisUrl = `redis://${server.host}:${server.port}`;
}, 300_000);

afterAll(async () => {
	await server.stop();
});

const user = z.object({ email: z.email() });
const hasher = scryptHasher({ cost: 10 });
let signUps = 0;
const credentials = () => {
	signUps += 1;
	return { email: `ada${signUps}@example.test`, password: 'correct horse' };
};

describe('connectKit()', () => {
	it('wires auth and access over PostgreSQL, keeps sessions there without Redis, and leaves a given db open', async () => {
		const pg = await openPglite();
		try {
			const kit = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
					access: ({ relations, auth }) =>
						permissions({
							model: defineModel({
								subjects: auth.types,
								types: {
									document: {
										relations: { owner: ['user'] },
										permissions: { view: ['owner'] },
									},
								},
							}),
							store: relations,
						}),
				}),
			);
			const { user: ada, token } = await kit.auth.signUp(credentials());
			const document = { type: 'document', id: 'd1' } as const;
			await kit.access.grant(document, 'owner', ada);
			expect(await kit.access.can(ada, 'view', document)).toBe(true);

			const request = new Request('https://x.test', {
				headers: { authorization: `Bearer ${token}` },
			});
			expect((await kit.auth.authenticate(request))?.user.id).toBe(ada.id);
			expect(kit.redis).toBeUndefined();

			const health = await kit.ping();
			expect(health.ok).toBe(true);
			expect(health.postgres.ok).toBe(true);
			expect(health.redis).toBeUndefined();

			// Deleting the user deletes the tuples naming them: relations is wired.
			await kit.auth.delete(ada);
			expect(await kit.access.can(ada, 'view', document)).toBe(false);

			await kit.close();
			await kit.close();
			// The db was handed in: still open.
			expect(await pg.db.$count(defineJanusTables().users)).toBe(0);
		} finally {
			await pg.close();
		}
	});

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

	it('queries the tables it is given, in a schema of their own', async () => {
		const janusSchema = pgSchema('janus');
		const pg = await openPglite({ schema: janusSchema });
		try {
			await using kit = await connectKit(
				defineConfig({
					postgres: {
						db: pg.db,
						tables: defineJanusTables({ schema: janusSchema }),
					},
					auth: (adapters) =>
						janus({ user, password: { login: 'email' }, hasher, ...adapters }),
				}),
			);
			await kit.auth.signUp(credentials());
			expect(
				await pg.db.$count(defineJanusTables({ schema: janusSchema }).users),
			).toBe(1);
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

	it('wraps auth and access with @nxgt/janus-telemetry when telemetry is on', async () => {
		const pg = await openPglite();
		try {
			let built: object | undefined;
			let builtAccess: object | undefined;
			await using kit = await connectKit(
				defineConfig({
					postgres: { db: pg.db },
					telemetry: true,
					auth: (adapters) => {
						const auth = janus({
							user,
							password: { login: 'email' },
							hasher,
							...adapters,
						});
						built = auth;
						return auth;
					},
					access: ({ relations, auth }) => {
						const access = permissions({
							model: defineModel({
								subjects: auth.types,
								types: {
									document: {
										relations: { owner: ['user'] },
										permissions: { view: ['owner'] },
									},
								},
							}),
							store: relations,
						});
						builtAccess = access;
						return access;
					},
				}),
			);
			// Each is wrapped: another object, with the same methods.
			expect(built).toBeDefined();
			expect(kit.auth).not.toBe(built as never);
			expect(builtAccess).toBeDefined();
			expect(kit.access).not.toBe(builtAccess as never);
			const { user: ada } = await kit.auth.signUp(credentials());
			expect(ada.email).toStartWith('ada');
			await kit.access.grant({ type: 'document', id: 'd1' }, 'owner', ada);
			expect(
				await kit.access.can(ada, 'view', { type: 'document', id: 'd1' }),
			).toBe(true);
		} finally {
			await pg.close();
		}
	});
});

describe('connectKit() over a PostgreSQL URL', () => {
	const url = process.env.JANUS_POSTGRES_URL;

	it.skipIf(url === undefined)(
		'opens the database, and closes it with the kit',
		async () => {
			const admin = new SQL(url as string);
			const name = `janus_kit_${process.pid}`;
			await admin.unsafe(`create database ${name}`);
			try {
				const target = new URL(url as string);
				target.pathname = `/${name}`;
				const setup = new SQL(target.toString());
				await setup.unsafe(await janusDdl()).simple();
				await setup.close();

				const kit = await connectKit(
					defineConfig({
						postgres: { url: target.toString() },
						auth: (adapters) =>
							janus({
								user,
								password: { login: 'email' },
								hasher,
								...adapters,
							}),
					}),
				);
				await kit.auth.signUp(credentials());
				expect((await kit.ping()).ok).toBe(true);
				await kit.close();
				expect((await kit.ping()).postgres.ok).toBe(false);
			} finally {
				await admin.unsafe(`drop database ${name} with (force)`);
				await admin.close();
			}
		},
	);
});
