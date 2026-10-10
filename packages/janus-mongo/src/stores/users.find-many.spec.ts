import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { type JanusStores, janus, mintId, scryptHasher } from '@nxgt/janus';
import { z } from 'zod';
import { startMongo, type TestServer } from '../../test/server';
import { createMongoStores, syncMongoStores } from './index';

let server: TestServer;

beforeAll(async () => {
	server = await startMongo();
}, 120_000);

afterAll(async () => {
	await server.stop();
});

/** The stores, counting the users store's reads by id. */
function counting(stores: JanusStores) {
	const calls = { findUser: 0, findUsers: 0 };
	const { users } = stores;
	const { findUsers } = users;
	return {
		calls,
		stores: {
			...stores,
			users: {
				...users,
				findUser: (id: string) => {
					calls.findUser += 1;
					return users.findUser(id);
				},
				...(findUsers === undefined
					? {}
					: {
							findUsers: (ids: readonly string[]) => {
								calls.findUsers += 1;
								return findUsers.call(users, ids);
							},
						}),
			},
		},
	};
}

describe('findMany over createMongoStores()', () => {
	it('reads a type’s users in one query, in the order asked, each once, others left out', async () => {
		const db = server.client.db('janusFindMany');
		await syncMongoStores(db);
		const { stores, calls } = counting(createMongoStores(db));
		const auth = janus({
			users: {
				patient: {
					schema: z.strictObject({ email: z.email() }),
					password: { login: 'email' },
				},
				staff: {
					schema: z.strictObject({ username: z.string() }),
					password: { login: 'username' },
				},
			},
			store: stores,
			hasher: scryptHasher({ cost: 10 }),
		});
		const a = await auth.patient.create({ email: 'a@example.test' });
		const b = await auth.patient.create({ email: 'b@example.test' });
		const c = await auth.patient.create({ email: 'c@example.test' });
		const staff = await auth.staff.create({ username: 'grace' });

		const found = await auth.patient.findMany([
			c.id,
			mintId(),
			staff.id,
			a.id,
			c.id,
			b.id,
		]);

		expect(found.map((user) => user.id)).toEqual([c.id, a.id, b.id]);
		expect(found[1]).toEqual(a);
		expect(calls).toEqual({ findUser: 0, findUsers: 1 });
		await db.dropDatabase();
	});
});
