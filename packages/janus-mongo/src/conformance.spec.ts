import { afterAll, beforeAll, describe, it } from 'bun:test';
import type { StoreFaults } from '@nxgt/janus/conformance';
import { describeJanusStores } from '@nxgt/janus/conformance';
import { startMongo, type TestServer } from '../test/server';
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
