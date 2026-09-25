import { afterAll, beforeAll, describe, it } from 'bun:test';
import { createMemoryStores } from '@nxgt/janus';
import {
	describeJanusStores,
	outageCases,
	userStoreCases,
} from '@nxgt/janus/conformance';
import { openCase } from '../test/case';
import { startRedis, type TestServer } from '../test/server';
import { createRedisStores } from './stores';

/**
 * The whole suite against a real Redis, outages included, with users in the
 * memory store: this adapter serves sessions and tokens only.
 *
 * **Each case runs as a Redis user of its own**, allowed only the keys of its
 * own prefix. **The faults are the server's**: `ACL SETUSER … -@all` takes
 * every command away from that user, so Redis itself refuses each one with
 * `NOPERM` — what is proven is what the adapter does with a real server
 * error, not with a wrapper that throws.
 */

let server: TestServer;

// A cold checkout compiles Redis first: about two minutes.
beforeAll(async () => {
	server = await startRedis();
}, 300_000);

afterAll(async () => {
	await server.stop();
});

/** The cases about users, which the memory store answers here, not Redis. */
const USERS_ARE_NOT_OURS = 'users are not a slot of @nxgt/janus-redis';
const skip = Object.fromEntries([
	...userStoreCases.map((c) => [c.id, USERS_ARE_NOT_OURS]),
	...outageCases
		.filter((c) =>
			/^outage\.(findUser|findUserByLogin|listUsers|deleteUser)$/.test(c.id),
		)
		.map((c) => [c.id, USERS_ARE_NOT_OURS]),
]);

describeJanusStores({
	name: '@nxgt/janus-redis',
	runner: { describe, it },
	skip,
	harness: {
		async open() {
			const test = await openCase(server);
			return {
				stores: {
					users: createMemoryStores().users,
					...createRedisStores(test.redis, { prefix: test.prefix }),
				},
				faults: { fail: test.fail },
				close: test.close,
			};
		},
	},
});
