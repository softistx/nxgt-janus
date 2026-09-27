import { describe, expect, it } from 'bun:test';
import type { ObjectPageRequest } from '@nxgt/janus/permissions';
import { MongoClient } from 'mongodb';
import { createMongoRelations } from './index';

describe('createMongoRelations(), beyond the port suite', () => {
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
