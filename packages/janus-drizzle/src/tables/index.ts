import { type PgSchema, pgTable } from 'drizzle-orm/pg-core';
import type { TableOf } from './columns';
import { relationsTable } from './relations';
import { sessionsTable } from './sessions';
import { tokensTable } from './tokens';
import { loginsTable, usersTable } from './users';

/**
 * The five tables, as Drizzle definitions: **your migrations create them**.
 * Export them from the schema file drizzle-kit reads, and `drizzle-kit
 * generate` writes them into your next migration like any table of your own.
 *
 * **The names carry no prefix** — `users`, `logins`, `sessions`, `tokens`,
 * `relations` — because the setup this package recommends is **a database of
 * its own**, backed up and restored on its own. Beside an application's own
 * tables, give them a PostgreSQL schema instead: `{ schema: pgSchema('janus') }`
 * makes them `janus.users` and the rest, and `pg_dump -n janus` backs them up
 * alone.
 *
 * Columns are `snake_case`, as PostgreSQL's own catalog and `@nxgt/drizzle`'s
 * columns are: a camelCase column would have to be quoted in every query
 * written by hand. The records the stores answer are camelCase, as everywhere
 * in Janus.
 *
 * **What the tables hold is the port's record**, field by field. Nothing is
 * encoded, so a row read in `psql` reads like the record in the code.
 */

/** Where the tables live. */
export interface JanusTablesOptions {
	/**
	 * A PostgreSQL schema of their own, `pgSchema('janus')`, for a database the
	 * application's tables share. **Export it from the schema file too**:
	 * drizzle-kit writes `CREATE SCHEMA` only for a schema it finds exported.
	 * Absent, the tables are in the connection's `search_path`, `public` by
	 * default: the database of their own.
	 */
	readonly schema?: PgSchema;
}

/**
 * The five tables, in the schema `options` names, or in none.
 *
 * ```ts
 * // src/janus/schema.ts — the schema file of Janus's own drizzle-kit config
 * export const { users, logins, sessions, tokens, relations } = defineJanusTables();
 *
 * // or, in a database the application's tables share
 * export const janus = pgSchema('janus');
 * export const { users, logins, sessions, tokens, relations } = defineJanusTables({ schema: janus });
 * ```
 *
 * Pass what the schema file exports to `createDrizzleAdapter` as `{ tables }`,
 * so the stores query the very tables your migration created.
 */
export function defineJanusTables(options: JanusTablesOptions = {}) {
	const { schema } = options;
	const table = (schema === undefined ? pgTable : schema.table) as TableOf;
	const users = usersTable(table);
	const logins = loginsTable(table, users);
	const sessions = sessionsTable(table);
	const tokens = tokensTable(table);
	const relations = relationsTable(table);
	return { users, logins, sessions, tokens, relations };
}

/** The five tables `defineJanusTables` answers. */
export type JanusTables = ReturnType<typeof defineJanusTables>;

/**
 * Which tables the stores query: **the ones your schema file exports**, so
 * the migration and the stores cannot disagree. Absent, `defineJanusTables()`:
 * the tables in the connection's `search_path`.
 *
 * ```ts
 * // src/db/schema.ts
 * export const janus = pgSchema('janus');
 * export const janusTables = defineJanusTables({ schema: janus });
 * export const { users, logins, sessions, tokens, relations } = janusTables;
 *
 * // where the adapter is wired
 * const postgres = createDrizzleAdapter(db, { tables: janusTables });
 * ```
 */
export interface DrizzleAdapterOptions<
	K extends keyof JanusTables = keyof JanusTables,
> {
	readonly tables?: Pick<JanusTables, K>;
}
