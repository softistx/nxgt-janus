import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { ObjectPageRequest } from '@nxgt/janus/permissions';
import { MongoClient } from 'mongodb';
import { startMongo, type TestServer } from '../../test/server';
import { createMongoRelations, syncMongoRelations } from './index';

let server: TestServer;

// A cold runner downloads mongod here, which no 5-second hook timeout allows.
beforeAll(async () => {
	server = await startMongo();
}, 120_000);

afterAll(async () => {
	await server.stop();
});

describe('createMongoRelations(), beyond the port suite', () => {
	it('writes all or nothing: a failed addition rolls its removal back', async () => {
		const db = server.client.db('janusRelationsAtomic');
		await syncMongoRelations(db);
		const store = createMongoRelations(db);
		const object = { type: 'record', id: 'r1' };
		const before = {
			object,
			relation: 'owners',
			subject: { type: 'staff', id: 'a' },
		};
		const after = { ...before, subject: { type: 'staff', id: 'b' } };
		await store.write({ add: [before] });

		try {
			// Only the addition fails: the removal ran, inside the transaction.
			await server.failAlways(['update'], 91);
			const outcome = await store
				.write({ remove: [before], add: [after] })
				.then(
					() => 'resolved',
					(error: { code?: string }) => error.code,
				);
			await server.clearFailures();

			expect(outcome).toBe('STORE_FAILED');
			expect(await store.has(before)).toBe(true);
			expect(await store.has(after)).toBe(false);
		} finally {
			await server.clearFailures();
			await db.dropDatabase();
		}
	});

	it('throws a malformed findObjects request as it is, not as a store failure', async () => {
		// Never connected: the request is refused before any I/O.
		const client = new MongoClient('mongodb://127.0.0.1:1');
		try {
			const store = createMongoRelations(client.db('janusRelations'));

			expect(() =>
				store.findObjects(undefined as unknown as ObjectPageRequest),
			).toThrow(TypeError);
		} finally {
			await client.close();
		}
	});
});
