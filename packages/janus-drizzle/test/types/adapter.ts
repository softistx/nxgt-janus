/**
 * What the adapter refuses at compile time: each `@ts-expect-error` is a
 * plausible mistake that must not compile.
 */

import { Database } from 'bun:sqlite';
import { PGlite } from '@electric-sql/pglite';
import { drizzle as overSqlite } from 'drizzle-orm/bun-sqlite';
import { pgSchema } from 'drizzle-orm/pg-core';
import { drizzle } from 'drizzle-orm/pglite';
import {
	createDrizzleAdapter,
	createDrizzleRelations,
	createDrizzleStores,
	defineJanusTables,
} from '../../src/index';

const client = new PGlite();
export const adapter = createDrizzleAdapter(drizzle({ client }));
const janus = pgSchema('janus');
export const inSchema = createDrizzleAdapter(drizzle({ client }), {
	schema: janus,
});

// @ts-expect-error 1. a connection string: the adapter connects to nothing
createDrizzleAdapter('postgres://localhost/app');
// @ts-expect-error 2. the driver's client, not the Drizzle instance over it
createDrizzleStores(client);
// @ts-expect-error 3. a Drizzle instance over SQLite: PostgreSQL only
createDrizzleRelations(overSqlite({ client: new Database(':memory:') }));
// @ts-expect-error 4. a schema's name: pass the `pgSchema` your schema file exports
defineJanusTables({ schema: 'janus' });
