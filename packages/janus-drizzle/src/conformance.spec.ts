import { describe, it } from 'bun:test';
import {
	describeJanusStores,
	describeRelationStores,
} from '@nxgt/janus/conformance';
import { openTestDb, type Table } from '../test/db';
import { createDrizzleRelations } from './relations';
import { createDrizzleStores } from './stores';

/**
 * The whole suite against a real PostgreSQL — PGlite, in process — outages
 * included.
 *
 * **The faults are the database's**, not a wrapper around the adapter: the
 * slot's table is renamed, so PostgreSQL itself refuses every statement on it
 * with `42P01`, and what is proven is what the adapter does with a real driver
 * error. A slot's methods all read or write its table, so failing the table
 * fails the method.
 */
const TABLE_OF: Record<'users' | 'sessions' | 'tokens', Table> = {
	users: 'janus_users',
	sessions: 'janus_sessions',
	tokens: 'janus_tokens',
};

describeJanusStores({
	name: '@nxgt/janus-drizzle',
	runner: { describe, it },
	harness: {
		async open() {
			// A database per case: nothing one case writes is seen by the next.
			const test = await openTestDb();
			return {
				stores: createDrizzleStores(test.db),
				faults: {
					fail: (slot) => test.takeAway(TABLE_OF[slot]),
				},
				close: test.close,
			};
		},
	},
});

describeRelationStores({
	name: '@nxgt/janus-drizzle',
	runner: { describe, it },
	harness: {
		async open() {
			const test = await openTestDb();
			return {
				store: createDrizzleRelations(test.db),
				faults: {
					// A write is checked by reading afterwards, so only writes fail.
					fail: (method) =>
						method === 'write'
							? test.refuseWrites('janus_relations')
							: test.takeAway('janus_relations'),
				},
				close: test.close,
			};
		},
	},
});
