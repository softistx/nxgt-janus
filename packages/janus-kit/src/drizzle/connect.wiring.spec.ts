import { describe, expect, it } from 'bun:test';
import { janus } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { defineJanusTables } from '@nxgt/janus-drizzle';
import { SQL } from 'bun';
import { pgSchema } from 'drizzle-orm/pg-core';
import { janusDdl, openPglite } from '../../test/postgres';
import { defineConfig } from './config';
import { connectKit } from './connect';
import { credentials, hasher, user } from './connect.fixtures';

// What connectKit() wires over PostgreSQL alone: auth, access, the tables it
// is given, telemetry, and a database it opens from a URL.

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
										related: { owners: ['user'] },
										permits: { view: ['owners'] },
									},
								},
							}),
							store: relations,
						}),
				}),
			);
			const { user: ada, token } = await kit.auth.signUp(credentials());
			const document = { type: 'document', id: 'd1' } as const;
			await kit.access.grant(document, 'owners', ada);
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
										related: { owners: ['user'] },
										permits: { view: ['owners'] },
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
			await kit.access.grant({ type: 'document', id: 'd1' }, 'owners', ada);
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
