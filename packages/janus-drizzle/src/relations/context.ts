import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { JanusTables } from '../tables';

export type Relations = JanusTables['relations'];

/** What every step queries: the database, and the `relations` table in use. */
export interface RelationContext {
	readonly db: PgDatabase;
	readonly relations: Relations;
}
