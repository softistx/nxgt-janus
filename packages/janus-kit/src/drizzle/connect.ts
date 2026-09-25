import type { PgDatabase } from '@nxgt/drizzle/pg';
import {
	createDrizzleAdapter,
	defineJanusTables,
	type JanusTables,
} from '@nxgt/janus-drizzle';
import { SQL } from 'bun';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';
import { getTableConfig } from 'drizzle-orm/pg-core';
import type { HealthOf } from '../shared/health';
import { timed } from '../shared/health';
import { assembleKit, type Closers, type KitOf } from '../shared/kit';
import { checkConfig, type KitConfig, type PostgresConfig } from './config';

/** What `ping` answers: `{ ok, postgres, redis? }`. */
export type Health = HealthOf<'postgres'>;

/** What `connectKit` answers: `auth`, `access` when configured, and the rest. */
export type Kit<A extends object, P extends object> = KitOf<
	A,
	P,
	PgDatabase,
	'postgres'
>;

/**
 * Opens the connections, checks that Janus's tables are there, and builds
 * `auth` and `access` over them.
 *
 * ```ts
 * export const kit = await connectKit(config);
 * const current = await kit.auth.authenticate(request);
 * await kit.close(); // or `await using kit = await connectKit(config)`
 * ```
 *
 * **It fails here, not at the first sign-in**: a database that does not
 * answer, or one without the tables your migrations create, rejects with an
 * `Error` naming what to do, after closing whatever it had opened.
 */
export async function connectKit<A extends object, P extends object = never>(
	config: KitConfig<A, P>,
): Promise<Kit<A, P>> {
	checkConfig(config, 'connectKit');
	return await assembleKit(config, async (closers) => {
		const { db, opened } = openPostgres(config.postgres, closers);
		const tables = config.postgres.tables ?? defineJanusTables();
		await assertTables(db, tables, opened);
		const { store, relations } = createDrizzleAdapter(db, { tables });
		return {
			name: 'postgres' as const,
			label: 'PostgreSQL',
			db,
			store,
			relations,
			probe: (timeoutMs) => timed(() => db.execute(sql`select 1`), timeoutMs),
		};
	});
}

function openPostgres(
	postgres: PostgresConfig,
	closers: Closers,
): { db: PgDatabase; opened: boolean } {
	if (postgres.url === undefined) return { db: postgres.db, opened: false };
	const client = new SQL(postgres.url);
	closers.push(() => client.close());
	return { db: drizzle({ client }) as unknown as PgDatabase, opened: true };
}

/**
 * Every table the stores query, by the name the configuration gives it. A
 * missing one is the most likely first-run mistake — migrations not applied,
 * or applied to another database — and would otherwise surface as the first
 * sign-up's `STORE_FAILED`.
 */
async function assertTables(
	db: PgDatabase,
	tables: JanusTables,
	opened: boolean,
) {
	const names = Object.values(tables).map((table) => {
		const { name, schema } = getTableConfig(table);
		return schema === undefined
			? quoted(name)
			: `${quoted(schema)}.${quoted(name)}`;
	});
	let reply: unknown;
	try {
		reply = await db.execute(
			sql`select name from unnest(array[${sql.join(
				names.map((name) => sql`${name}`),
				sql`, `,
			)}]::text[]) as name where to_regclass(name) is null`,
		);
	} catch (cause) {
		throw new Error(
			opened
				? 'connectKit: PostgreSQL did not answer. Check `postgres.url`, and that the database exists.'
				: 'connectKit: the Drizzle instance in `postgres.db` did not answer.',
			{ cause },
		);
	}
	const rows = (
		Array.isArray(reply) ? reply : (reply as { rows: unknown[] }).rows
	) as { name: string }[];
	if (rows.length > 0) {
		throw new Error(
			`connectKit: Janus's tables are missing from this database: ${rows
				.map((row) => row.name)
				.join(
					', ',
				)}. Apply the migration drizzle-kit generated from defineJanusTables(), to the database \`postgres\` names.`,
		);
	}
}

/** A PostgreSQL identifier, quoted as `to_regclass` reads it. */
function quoted(identifier: string): string {
	return `"${identifier.replaceAll('"', '""')}"`;
}
