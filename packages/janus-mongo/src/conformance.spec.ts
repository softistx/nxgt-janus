import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import type { StoreFaults } from '@nxgt/janus/conformance';
import {
	describeJanusStores,
	describeRelationStores,
} from '@nxgt/janus/conformance';
import { startMongo, type TestServer } from '../test/server';
import { createMongoRelations, syncMongoRelations } from './relations';
import { createMongoStores, syncMongoStores } from './stores';

/**
 * The whole suite against a real mongod, outages included.
 *
 * **The faults are the server's**, not a wrapper around the adapter: a
 * `failCommand` fail point makes mongod itself refuse the command the method
 * sends, so what is proven is what the adapter does with a real driver error.
 * Code 91, `ShutdownInProgress`, measured in nxgt-data: it is a network-class
 * error the driver retries once and then surfaces, which is what a primary
 * going away looks like. Codes 2, 9, 14 and 40647 are the caller's input and
 * never retried, so they cannot stand for a transient outage.
 */
const COMMAND_OF: Record<string, readonly string[]> = {
	findUser: ['find'],
	findUserByLogin: ['find'],
	listUsers: ['find'],
	findSessionByTokenHash: ['find'],
	extendSession: ['findAndModify'],
	revokeSession: ['update'],
	revokeUserSessions: ['update'],
	consumeToken: ['findAndModify'],
	countAttempt: ['findAndModify', 'find'],
	deleteUser: ['delete'],
	deleteUserSessions: ['delete'],
	deleteUserTokens: ['delete'],
};

let server: TestServer;
let opened = 0;

// A cold runner downloads mongod here, which no 5-second hook timeout allows.
beforeAll(async () => {
	server = await startMongo();
}, 120_000);

afterAll(async () => {
	await server.stop();
});

describeJanusStores({
	name: '@nxgt/janus-mongo',
	runner: { describe, it },
	harness: {
		async open() {
			// A database per case: nothing one case writes is seen by the next.
			opened += 1;
			const db = server.client.db(`janusCase${opened}`);
			await syncMongoStores(db);

			const faults: StoreFaults = {
				async fail(_slot, method) {
					const commands = COMMAND_OF[method];
					if (commands === undefined) {
						throw new TypeError(`no command is failed for ${method}`);
					}
					await server.failAlways(commands, 91);
				},
			};

			return {
				stores: createMongoStores(db),
				faults,
				close: async () => {
					await server.clearFailures();
					await db.dropDatabase();
				},
			};
		},
	},
});

/** The commands each relation store method sends, failed by the same fail point. */
const RELATION_COMMAND_OF: Record<string, readonly string[]> = {
	// The outage case writes a removal and an addition: a transaction, whose
	// first statement is the delete.
	write: ['delete', 'update'],
	has: ['find'],
	findSubjectSets: ['find'],
	findEntities: ['find'],
	findObjects: ['find'],
	deleteEntity: ['delete'],
};

describeRelationStores({
	name: '@nxgt/janus-mongo',
	runner: { describe, it },
	harness: {
		async open() {
			opened += 1;
			const db = server.client.db(`janusRelations${opened}`);
			await syncMongoRelations(db);

			return {
				store: createMongoRelations(db),
				faults: {
					async fail(method) {
						const commands = RELATION_COMMAND_OF[method];
						if (commands === undefined) {
							throw new TypeError(`no command is failed for ${method}`);
						}
						await server.failAlways(commands, 91);
					},
				},
				close: async () => {
					await server.clearFailures();
					await db.dropDatabase();
				},
			};
		},
	},
});

describe('@nxgt/janus-mongo relations, beyond the port suite', () => {
	it('writes all or nothing: a failed addition rolls its removal back', async () => {
		opened += 1;
		const db = server.client.db(`janusRelations${opened}`);
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
});
