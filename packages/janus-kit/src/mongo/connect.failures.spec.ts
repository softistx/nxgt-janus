import { describe, expect, it } from 'bun:test';
import { defineConfig } from './config';
import { connectKit } from './connect';
import { auth, mongoPerFile } from './connect.fixtures';

// How connectKit() fails over MongoDB, what it only warns of, and how ping()
// reports a database that stops answering: never naming a URL.

const { database } = mongoPerFile();

describe('connectKit() over MongoDB', () => {
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
