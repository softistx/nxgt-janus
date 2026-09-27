import { describe, expect, it } from 'bun:test';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { connectMongo } from '@nxgt/mongo';
import { defineConfig } from './config';
import { connectKit } from './connect';
import { auth, mongoPerFile } from './connect.fixtures';

// What connectKit() wires over MongoDB: auth and access over a Db given or a
// URL opened, and a URL another connection holds left to @nxgt/mongo.

const { database, urlOf } = mongoPerFile();

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
									related: { owners: ['user'] },
									permits: { view: ['owners'] },
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
		await kit.access.grant(document, 'owners', ada);
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
});
