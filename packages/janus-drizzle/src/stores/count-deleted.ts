import type { PgDatabase } from '@nxgt/drizzle/pg';
import { count, type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';

/**
 * Deletes the rows of `table` matching `where` and answers how many, counted
 * by the server: `with d as (delete … returning 1) select count(*) from d`.
 * A collection can delete millions of rows; none of them reaches the process.
 */
export async function deleteAndCount(
	db: PgDatabase,
	table: PgTable,
	where: SQL | undefined,
): Promise<number> {
	const deleted = db.$with('deleted').as(
		db
			.delete(table)
			.where(where)
			.returning({ one: sql<number>`1`.as('one') }),
	);
	const [row] = await db.with(deleted).select({ n: count() }).from(deleted);
	return row?.n ?? 0;
}
