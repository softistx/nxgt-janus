import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mintId } from '@nxgt/janus';
import { getCollection } from '@nxgt/mongo';
import { startMongo, type TestServer } from '../test/server';
import {
	tokens as tokensCollection,
	users as usersCollection,
} from './collections';
import { createMongoStores, syncMongoStores } from './stores';

let server: TestServer;

beforeAll(async () => {
	server = await startMongo();
}, 120_000);

afterAll(async () => {
	await server.stop();
});

const at = new Date('2026-01-01T00:00:00.000Z');

describe('createMongoStores(), beyond the port suite', () => {
	it('reads documents written before 0.3 as no second factor, no code and no attempts', async () => {
		const db = server.client.db('janusLegacy');
		await syncMongoStores(db);
		const { users, tokens } = createMongoStores(db);

		const user = await users.insertUser({
			id: mintId(),
			type: 'user',
			schemaVersion: '1',
			active: true,
			fields: { email: 'ada@example.test' },
			logins: ['ada@example.test'],
			password: null,
			secondFactor: null,
			emailVerifiedAt: null,
			version: 0,
			createdAt: at,
			updatedAt: at,
		});
		await tokens.insertToken({
			tokenHash: 'legacy',
			kind: 'resetPassword',
			userId: user.id,
			address: 'ada@example.test',
			codeHash: null,
			attempts: 0,
			expiresAt: new Date('2099-01-01T00:00:00.000Z'),
			spentAt: null,
			createdAt: at,
		});
		// What a document written by 0.2 holds: none of the fields 0.3 added.
		const unset = await Promise.all([
			getCollection(db, usersCollection).raw.updateOne(
				{ _id: user.id },
				{ $unset: { secondFactor: '' } },
			),
			getCollection(db, tokensCollection).raw.updateOne(
				{ _id: 'legacy' },
				{ $unset: { codeHash: '', attempts: '' } },
			),
		]);
		expect(unset.map((outcome) => outcome.modifiedCount)).toEqual([1, 1]);

		expect(await users.findUser(user.id)).toMatchObject({ secondFactor: null });
		expect(await tokens.countAttempt('legacy', 'resetPassword')).toMatchObject({
			codeHash: null,
			attempts: 1,
		});
		await db.dropDatabase();
	});
});
