import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import { createDrizzleRelations } from './relations';
import { createDrizzleStores } from './stores';
import type { JanusTablesOptions } from './tables';

/** The whole adapter over one database, keyed as `janus()` takes it. */
export interface DrizzleAdapter {
	/** The identity stores: `createDrizzleStores(db)`. */
	readonly store: JanusStores;
	/** The relation store: `createDrizzleRelations(db)`. */
	readonly relations: RelationStore;
}

/**
 * The identity stores and the relation store over one database, under the
 * names `janus()` takes them — so one spread wires both, and deleting a user
 * deletes every tuple naming them:
 *
 * ```ts
 * const postgres = createDrizzleAdapter(db);
 * const auth = janus({ user, password: { login: 'email' }, hasher, ...postgres });
 * const access = permissions({ model, store: postgres.relations });
 * ```
 *
 * It connects to nothing and creates nothing: `db` is your Drizzle instance,
 * and the tables are your migrations'. `{ schema }` names the PostgreSQL
 * schema they are in, as `defineJanusTables` was given it. An application that only
 * authenticates can take `createDrizzleStores(db)` alone.
 */
export function createDrizzleAdapter(
	db: PgDatabase,
	options: JanusTablesOptions = {},
): DrizzleAdapter {
	return {
		store: createDrizzleStores(db, options),
		relations: createDrizzleRelations(db, options),
	};
}
