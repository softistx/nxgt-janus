/**
 * `@nxgt/janus-drizzle` — the PostgreSQL adapter for `@nxgt/janus`, on
 * Drizzle and `@nxgt/drizzle`.
 *
 * Implements all three stores of the `@nxgt/janus` store port, and the
 * relation store of `@nxgt/janus/permissions`, over one database. The tables
 * are exported for the application's own drizzle-kit migrations. It defines
 * **no error class**: every refusal is `@nxgt/janus`'s own, from the peer the
 * application installed, so `instanceof` holds across the two packages.
 */

export { createDrizzleAdapter, type DrizzleAdapter } from './adapter';
export { createDrizzleRelations } from './relations';
export { createDrizzleStores } from './stores';
export {
	type DrizzleAdapterOptions,
	defineJanusTables,
	type JanusTables,
	type JanusTablesOptions,
} from './tables';
