import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { z } from 'zod';
import { startMongo, type TestServer } from '../test/server';
import { createMongoAdapter, syncMongoAdapter } from './adapter';

let server: TestServer;

beforeAll(async () => {
	server = await startMongo();
}, 120_000);

afterAll(async () => {
	await server.stop();
});

describe('createMongoAdapter()', () => {
	it('wires both sides with one spread: deleting a user deletes their tuples', async () => {
		const db = server.client.db('janusAdapter');
		await syncMongoAdapter(db);
		const mongo = createMongoAdapter(db);
		const auth = janus({
			user: z.strictObject({ email: z.email() }),
			password: { login: 'email' },
			hasher: scryptHasher({ cost: 10 }),
			...mongo,
		});
		const access = permissions({
			model: defineModel({
				subjects: auth.types,
				types: { note: { related: { owners: ['user'] } } },
			}),
			store: mongo.relations,
		});
		const { user } = await auth.signUp({
			email: 'ada@example.test',
			password: 'correct horse',
		});
		const note = { type: 'note', id: 'n1' } as const;
		await access.grant(note, 'owners', user);
		expect(await access.can(user, 'owners', note)).toBe(true);

		expect(await auth.delete(user)).toBe(true);

		// The tuple went with the user: the relation store was wired into janus().
		expect(await access.can(user, 'owners', note)).toBe(false);
		await db.dropDatabase();
	});
});

describe('syncMongoAdapter()', () => {
	it('syncs the four collections, and a second run changes nothing', async () => {
		const db = server.client.db('janusAdapterSync');
		const first = await syncMongoAdapter(db);
		expect(first.map((report) => [report.name, report.created])).toEqual([
			['users', true],
			['sessions', true],
			['tokens', true],
			['relations', true],
		]);

		const second = await syncMongoAdapter(db);
		expect(second.every((report) => !report.created)).toBe(true);
		expect(second.flatMap((report) => report.indexes.created)).toEqual([]);
		await db.dropDatabase();
	});
});
