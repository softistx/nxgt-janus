import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import { SQL } from 'bun';
import {
	generateDrizzleJson,
	generateMigration,
} from 'drizzle-kit/api-postgres';
import { drizzle as overBunSql } from 'drizzle-orm/bun-sql';
import { drizzle as overPg } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/pglite';
import { drizzle as overPostgresJs } from 'drizzle-orm/postgres-js';
import { Pool } from 'pg';
import postgres from 'postgres';
import { defineJanusTables, type JanusTablesOptions } from '../src/tables';

/**
 * The DDL drizzle-kit writes for the exported tables — what an application's
 * migration will hold — so the specs never run on a schema of their own.
 */
async function migration(options: JanusTablesOptions): Promise<string> {
	const empty = await generateDrizzleJson({});
	// The schema is exported beside the tables, as the application's file does.
	const current = await generateDrizzleJson({
		...(options.schema === undefined ? {} : { janus: options.schema }),
		...defineJanusTables(options),
	});
	return (await generateMigration(empty, current)).join(';\n');
}

/** The DDL of each layout, generated once: `''` is the unprefixed one. */
const ddls = new Map<string, Promise<string>>();

function ddlOf(options: JanusTablesOptions): Promise<string> {
	const key = options.schema?.schemaName ?? '';
	let ddl = ddls.get(key);
	if (ddl === undefined) {
		ddl = migration(options);
		ddls.set(key, ddl);
	}
	return ddl;
}

/** Every table a fault can take away. */
export type Table = 'users' | 'sessions' | 'tokens' | 'relations';

/**
 * A real PostgreSQL, in memory, in process: PGlite, as `@nxgt/drizzle`'s own
 * specs run on. One per case, migrated with drizzle-kit's DDL.
 *
 * `takeAway(table)` renames a table, so every statement on it is refused by
 * PostgreSQL itself — `42P01`, undefined table. `refuseWrites(table)` leaves
 * it readable and has a trigger raise on every insert, update and delete. What
 * is proven either way is what the adapter does with a real driver error, not
 * with a wrapper that throws.
 */
export async function openTestDb(
	options: JanusTablesOptions = {},
): Promise<TestDatabase> {
	const server = process.env.JANUS_POSTGRES_URL;
	return server === undefined
		? openPglite(options)
		: openServer(server, options);
}

/** What a spec gets: a Drizzle instance, a raw `exec`, and the two faults. */
export interface TestDatabase {
	readonly db: PgDatabase;
	exec(statements: string): Promise<void>;
	takeAway(table: Table): Promise<void>;
	refuseWrites(table: Table): Promise<void>;
	close(): Promise<void>;
}

async function openPglite(options: JanusTablesOptions): Promise<TestDatabase> {
	const client = new PGlite();
	await client.exec(await ddlOf(options));
	const exec = async (statements: string) => {
		await client.exec(statements);
	};
	return {
		db: drizzle({ client }),
		exec,
		...faultsOver(exec, options),
		close: () => client.close(),
	};
}

let opened = 0;

/**
 * A fresh database per case on a real server — **what PGlite cannot prove**:
 * PGlite runs one connection, so twenty concurrent `consumeToken` calls are
 * serialised there, and a lock that is missing is never missed. The database
 * is created with ICU's `en-US` collation, under which `B` sorts after `a`,
 * so a key that is not `collate "C"` pages out of order.
 *
 * `JANUS_POSTGRES_URL=postgres://postgres:janus@localhost:55432/postgres bun test src`
 */
async function openServer(
	url: string,
	options: JanusTablesOptions,
): Promise<TestDatabase> {
	opened += 1;
	const name = `janus_case_${process.pid}_${opened}`;
	const admin = new SQL(url);
	await admin.unsafe(
		`create database ${name} template template0 locale_provider icu icu_locale 'en-US'`,
	);
	const target = new URL(url);
	target.pathname = `/${name}`;
	const client = new SQL(target.toString());
	await client.unsafe(await ddlOf(options)).simple();
	const exec = async (statements: string) => {
		await client.unsafe(statements).simple();
	};
	const over = await driven(target.toString());
	return {
		db: over.db,
		exec,
		...faultsOver(exec, options),
		close: async () => {
			await over.close();
			await client.close();
			await admin.unsafe(`drop database ${name} with (force)`);
			await admin.close();
		},
	};
}

/**
 * The Drizzle instance the stores run on, over the driver `JANUS_DRIVER`
 * names: `bun-sql` (the default), `node-postgres` or `postgres-js`. Each
 * shapes results, dates and errors its own way, and a `Date` one driver takes
 * in a `sql` template another refuses — so CI runs the suites over all three.
 */
async function driven(
	url: string,
): Promise<{ readonly db: PgDatabase; close(): Promise<void> }> {
	const driver = process.env.JANUS_DRIVER ?? 'bun-sql';
	switch (driver) {
		case 'bun-sql': {
			const client = new SQL(url);
			return { db: overBunSql({ client }), close: () => client.close() };
		}
		case 'node-postgres': {
			const client = new Pool({ connectionString: url });
			return { db: overPg({ client }), close: () => client.end() };
		}
		case 'postgres-js': {
			const client = postgres(url, { onnotice: () => {} });
			return { db: overPostgresJs({ client }), close: () => client.end() };
		}
		default:
			throw new TypeError(`JANUS_DRIVER: no driver named ${driver}`);
	}
}

function faultsOver(
	exec: (statements: string) => Promise<void>,
	{ schema }: JanusTablesOptions,
) {
	const qualified = (table: Table) =>
		schema === undefined ? table : `${schema.schemaName}.${table}`;
	return {
		takeAway: (table: Table) =>
			exec(`alter table ${qualified(table)} rename to ${table}_away`),
		refuseWrites: (table: Table) =>
			exec(`
				create or replace function janus_refuse() returns trigger
					language plpgsql as $$ begin raise exception 'refused'; end $$;
				create trigger janus_refuse before insert or update or delete
					on ${qualified(table)} for each statement execute function janus_refuse();
			`),
	};
}
