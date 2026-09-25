import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { syncMongoAdapter } from '@nxgt/janus-mongo';
import { closeMongo, connectMongo } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { z } from 'zod';
import { startMongo, type TestServer } from '../../test/mongo';
import { defineConfig } from './config';
import { connectKit } from './connect';

let server: TestServer;

beforeAll(async () => {
	server = await startMongo();
}, 300_000);

afterAll(async () => {
	await closeMongo();
	await server.stop();
});

const user = z.object({ email: z.email() });
const hasher = scryptHasher({ cost: 10 });
let databases = 0;
/** A database of its own per case, synced unless asked otherwise. */
async function database(synced = true): Promise<Db> {
	databases += 1;
	const db = server.client.db(`kit${databases}`);
	if (synced) await syncMongoAdapter(db);
	return db;
}
/** The replica set's URL, naming `name` as its database. */
function urlOf(name: string): string {
	const { hosts, replicaSet } = server.client.options;
	return `mongodb://${hosts.map(String).join(',')}/${name}?replicaSet=${replicaSet}`;
}
const auth = (
	adapters: Parameters<Parameters<typeof defineConfig>[0]['auth']>[0],
) => janus({ user, password: { login: 'email' }, hasher, ...adapters });

describe('connectKit() over MongoDB', () => {
	it('wires auth and access over a Db it was given, and leaves it open', async () => {
		const db = await database();
		const kit = await connectKit(
			defineConfig({
				mongo: { db },
				auth,
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
		const { user: ada, token } = await kit.auth.signUp({
			email: 'ada@example.test',
			password: 'correct horse',
		});
		const document = { type: 'document', id: 'd1' } as const;
		await kit.access.grant(document, 'owner', ada);
		expect(await kit.access.can(ada, 'view', document)).toBe(true);
		const request = new Request('https://x.test', {
			headers: { authorization: `Bearer ${token}` },
		});
		expect((await kit.auth.authenticate(request))?.user.id).toBe(ada.id);
		expect(kit.db).toBe(db);

		const health = await kit.ping();
		expect(health).toMatchObject({ ok: true, mongo: { ok: true } });
		expect(health.redis).toBeUndefined();

		// Deleting the user deletes the tuples naming them: relations is wired.
		await kit.auth.delete(ada);
		expect(await kit.access.can(ada, 'view', document)).toBe(false);

		await kit.close();
		// The Db was handed in: still open.
		expect(await db.collection('users').countDocuments()).toBe(0);
	});

	it('opens a URL, uses the database its path names, and closes it', async () => {
		const db = await database();
		const kit = await connectKit(
			defineConfig({ mongo: { url: urlOf(db.databaseName) }, auth }),
		);
		await kit.auth.signUp({
			email: 'bo@example.test',
			password: 'correct horse',
		});
		expect(kit.db.databaseName).toBe(db.databaseName);
		expect(await db.collection('users').countDocuments()).toBe(1);
		expect((await kit.ping()).mongo.ok).toBe(true);

		await kit.close();
		expect((await kit.ping({ timeoutMs: 500 })).mongo.ok).toBe(false);
	});

	it('fails at connect, naming the collections that are missing, and writes nothing', async () => {
		const db = await database(false);
		const outcome = await connectKit(
			defineConfig({ mongo: { db }, auth }),
		).then(
			() => 'resolved',
			(error: Error) => error.message,
		);
		expect(outcome).toBe(
			"connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: users (missing), sessions (missing), tokens (missing), relations (missing). Run syncMongoAdapter(db), a deployment step, against the database `mongo` names.",
		);
		expect(await db.listCollections().toArray()).toEqual([]);
	});

	it('fails at connect on a collection whose indexes drifted — two users could share a login', async () => {
		const db = await database();
		await db.collection('users').dropIndex('loginUnique');
		const outcome = await connectKit(
			defineConfig({ mongo: { db }, auth }),
		).then(
			() => 'resolved',
			(error: Error) => error.message,
		);
		expect(outcome).toContain(
			"Janus's collections are not in sync with @nxgt/janus-mongo: users (indexes).",
		);
	});

	it('only warns of a collection that differs from these definitions — a rollback must still start', async () => {
		const db = await database();
		await db.command({ collMod: 'users', validator: {} });
		const warnings: { message: string; code: string | undefined }[] = [];
		const onWarning = (warning: Error & { code?: string }) => {
			warnings.push({ message: warning.message, code: warning.code });
		};
		process.on('warning', onWarning);
		try {
			await using kit = await connectKit(defineConfig({ mongo: { db }, auth }));
			expect((await kit.ping()).ok).toBe(true);
			await new Promise((resolve) => setImmediate(resolve));
			expect(warnings).toEqual([
				{
					message:
						"connectKit: Janus's collections differ from this @nxgt/janus-mongo's definitions: users (validator). Run syncMongoAdapter(db) once every instance runs this version.",
					code: 'JANUS_KIT_COLLECTIONS_DRIFTED',
				},
			]);
		} finally {
			process.off('warning', onWarning);
		}
	});

	it('refuses a URL the driver cannot read as a TypeError, never quoting it', async () => {
		for (const url of [
			'mongodb://janus:s3cret@h:notaport/janus',
			'mongodb://u:p@ss@h/janus',
		]) {
			const outcome = await connectKit(
				defineConfig({ mongo: { url }, auth }),
			).then(
				() => 'resolved',
				(error: Error) => `${error.name}: ${error.message}`,
			);
			expect(outcome).toBe(
				'TypeError: connectKit: `mongo.url` is not a connection string the driver can read.',
			);
		}
	});

	it("fails on a Db that does not answer, with the driver's error as its cause", async () => {
		const synced = await database();
		const broken = new Error('client was closed');
		const db = new Proxy(synced, {
			get(target, key, receiver) {
				const value: unknown = Reflect.get(target, key, receiver);
				if (key !== 'listCollections' || typeof value !== 'function') {
					return value;
				}
				return () => {
					throw broken;
				};
			},
		});
		const outcome = await connectKit(
			defineConfig({ mongo: { db }, auth }),
		).then(
			() => undefined,
			(error: Error) => error,
		);
		expect(outcome?.message).toBe(
			'connectKit: the Db in `mongo.db` did not answer.',
		);
		expect(outcome?.cause).toBe(broken);
	});

	it('fails on a MongoDB that refuses the connection within its selection timeout, never naming the URL', async () => {
		const started = performance.now();
		const outcome = await connectKit(
			defineConfig({
				mongo: { url: 'mongodb://janus:s3cret@127.0.0.1:1/janus' },
				auth,
			}),
		).then(
			() => 'resolved',
			(error: Error) => error.message,
		);
		expect(outcome).toBe(
			'connectKit: MongoDB did not answer. Check `mongo.url`, and that the server is reachable.',
		);
		// The kit's serverSelectionTimeoutMS, 5 s; the driver's own is 30 s.
		const elapsed = performance.now() - started;
		expect(elapsed).toBeGreaterThan(4_500);
		expect(elapsed).toBeLessThan(10_000);
	}, 20_000);

	it("passes @nxgt/mongo's refusal of a URL already connected with other options through", async () => {
		const db = await database();
		const url = urlOf(db.databaseName);
		await using mine = await connectMongo(url);
		const outcome = await connectKit(
			defineConfig({ mongo: { url }, auth }),
		).then(
			() => 'resolved',
			(error: Error) => `${error.name}: ${error.message}`,
		);
		expect(outcome).toStartWith(
			'TypeError: connectMongo: this URI is already connected with other options.',
		);
		expect(mine.db.databaseName).toBe(db.databaseName);
	});

	it('reports a database that stops answering as ok: false within timeoutMs', async () => {
		const synced = await database();
		let hang = false;
		const db = new Proxy(synced, {
			get(target, key, receiver) {
				const value: unknown = Reflect.get(target, key, receiver);
				if (key !== 'command' || typeof value !== 'function') return value;
				return (...args: unknown[]) =>
					hang ? new Promise(() => {}) : value.apply(target, args);
			},
		});
		await using kit = await connectKit(defineConfig({ mongo: { db }, auth }));
		hang = true;
		const health = await kit.ping({ timeoutMs: 50 });
		expect(health.ok).toBe(false);
		expect(String((health.mongo as { error: Error }).error.message)).toBe(
			'ping: no answer in 50ms',
		);
	});
});
