import { customType, type pgTable, timestamp } from 'drizzle-orm/pg-core';

/** `pgTable`, or the `table` of the schema the tables live in. */
export type TableOf = typeof pgTable;

/**
 * A key compared byte by byte, as the port asks (rule 4): `collate "C"`. Under
 * a database's default collation, `en_US.UTF-8` or the like, `B` sorts after
 * `a` — and a page in "ascending id order" repeats or skips rows.
 */
export const key = customType<{ data: string; driverData: string }>({
	dataType: () => 'text collate "C"',
});

// Millisecond precision: a JavaScript `Date` has no more. At PostgreSQL's
// default of microseconds, a timestamp written and read back is not the one
// the core wrote.
export const at = (name: string) =>
	timestamp(name, { withTimezone: true, precision: 3 });
