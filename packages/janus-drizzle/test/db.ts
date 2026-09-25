import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import { SQL } from 'bun';
import {
	generateDrizzleJson,
	generateMigration,
} from 'drizzle-kit/api-postgres';
import { drizzle as overBunSql } from 'drizzle-orm/bun-sql';
import { drizzle } from 'drizzle-orm/pglite';
import { janusTables } from '../src/tables';

/**
 * The DDL drizzle-kit writes for the exported tables — what an application's
 * migration will hold — so the specs never run on a schema of their own.
 */
async function migration(): Promise<string> {
	const empty = await generateDrizzleJson({});
	const current = await generateDrizzleJson({ ...janusTables });
	return (await generateMigration(empty, current)).join(';\n');
}

let ddl: Promise<string> | undefined;

/** Every table a fault can take away, and what it is renamed to. */
export type Table =
	| 'janus_users'
	| 'janus_sessions'
	| 'janus_tokens'
	| 'janus_relations';

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
export async function openTestDb(): Promise<TestDatabase> {
	const server = process.env.JANUS_POSTGRES_URL;
	return server === undefined ? openPglite() : openServer(server);
}

/** What a spec gets: a Drizzle instance, a raw `exec`, and the two faults. */
export interface TestDatabase {
	readonly db: PgDatabase;
	exec(statements: string): Promise<void>;
	takeAway(table: Table): Promise<void>;
	refuseWrites(table: Table): Promise<void>;
	close(): Promise<void>;
}

async function openPglite(): Promise<TestDatabase> {
	ddl ??= migration();
	const client = new PGlite();
	await client.exec(await ddl);
	const exec = async (statements: string) => {
		await client.exec(statements);
	};
	return {
		db: drizzle({ client }),
		exec,
		...faultsOver(exec),
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
async function openServer(url: string): Promise<TestDatabase> {
	opened += 1;
	const name = `janus_case_${process.pid}_${opened}`;
	const admin = new SQL(url);
	await admin.unsafe(
		`create database ${name} template template0 locale_provider icu icu_locale 'en-US'`,
	);
	const target = new URL(url);
	target.pathname = `/${name}`;
	const client = new SQL(target.toString());
	ddl ??= migration();
	await client.unsafe(await ddl).simple();
	const exec = async (statements: string) => {
		await client.unsafe(statements).simple();
	};
	return {
		db: overBunSql({ client }),
		exec,
		...faultsOver(exec),
		close: async () => {
			await client.close();
			await admin.unsafe(`drop database ${name} with (force)`);
			await admin.close();
		},
	};
}

function faultsOver(exec: (statements: string) => Promise<void>) {
	return {
		takeAway: (table: Table) =>
			exec(`alter table ${table} rename to ${table}_away`),
		refuseWrites: (table: Table) =>
			exec(`
				create or replace function janus_refuse() returns trigger
					language plpgsql as $$ begin raise exception 'refused'; end $$;
				create trigger janus_refuse before insert or update or delete
					on ${table} for each statement execute function janus_refuse();
			`),
	};
}
