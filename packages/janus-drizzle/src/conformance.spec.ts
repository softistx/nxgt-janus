import { describe, it } from 'bun:test';
import {
	describeJanusStores,
	describeRelationStores,
} from '@nxgt/janus/conformance';
import { pgSchema } from 'drizzle-orm/pg-core';
import { openTestDb, type Table } from '../test/db';
import { createDrizzleRelations } from './relations';
import { createDrizzleStores } from './stores';
import type { JanusTablesOptions } from './tables';

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
	users: 'users',
	sessions: 'sessions',
	tokens: 'tokens',
};

/**
 * Both layouts: the tables in a database of their own, unprefixed, and in a
 * PostgreSQL schema of their own beside an application's tables.
 */
const LAYOUTS: readonly {
	readonly name: string;
	readonly options: JanusTablesOptions;
}[] = [
	{ name: '@nxgt/janus-drizzle', options: {} },
	{
		name: "@nxgt/janus-drizzle, schema 'janus'",
		options: { schema: pgSchema('janus') },
	},
];

for (const { name, options } of LAYOUTS) {
	describeJanusStores({
		name,
		runner: { describe, it },
		harness: {
			async open() {
				// A database per case: nothing one case writes is seen by the next.
				const test = await openTestDb(options);
				return {
					stores: createDrizzleStores(test.db, options),
					faults: {
						fail: (slot) => test.takeAway(TABLE_OF[slot]),
					},
					close: test.close,
				};
			},
		},
	});

	describeRelationStores({
		name,
		runner: { describe, it },
		harness: {
			async open() {
				const test = await openTestDb(options);
				return {
					store: createDrizzleRelations(test.db, options),
					faults: {
						// A write is checked by reading afterwards, so only writes fail.
						fail: (method) =>
							method === 'write'
								? test.refuseWrites('relations')
								: test.takeAway('relations'),
					},
					close: test.close,
				};
			},
		},
	});
}
