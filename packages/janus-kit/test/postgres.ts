import { PGlite } from '@electric-sql/pglite';
import type { PgDatabase } from '@nxgt/drizzle/pg';
import {
	defineJanusTables,
	type JanusTablesOptions,
} from '@nxgt/janus-drizzle';
import {
	generateDrizzleJson,
	generateMigration,
} from 'drizzle-kit/api-postgres';
import { drizzle } from 'drizzle-orm/pglite';

/**
 * The DDL drizzle-kit writes for Janus's tables, in either layout: what an
 * application's migration holds.
 */
export async function janusDdl(options: JanusTablesOptions = {}) {
	const empty = await generateDrizzleJson({});
	const current = await generateDrizzleJson({
		...(options.schema === undefined ? {} : { janus: options.schema }),
		...defineJanusTables(options),
	});
	return (await generateMigration(empty, current)).join(';\n');
}

/** A PGlite database, migrated unless `migrated` is false. */
export async function openPglite(
	options: JanusTablesOptions & { readonly migrated?: boolean } = {},
): Promise<{ db: PgDatabase; close(): Promise<void> }> {
	const client = new PGlite();
	if (options.migrated !== false) await client.exec(await janusDdl(options));
	return {
		db: drizzle({ client }) as unknown as PgDatabase,
		close: () => client.close(),
	};
}
