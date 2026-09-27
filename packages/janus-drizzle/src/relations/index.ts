import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { RelationStore } from '@nxgt/janus/permissions';
import { type DrizzleAdapterOptions, defineJanusTables } from '../tables';
import { run } from '../translate';
import type { RelationContext } from './context';
import { findEntities, findObjects, findSubjectSets, has } from './reads';
import { deleteEntity, write } from './writes';

/**
 * The relation store `permissions()` takes, over one PostgreSQL database
 * through Drizzle — and the one `janus({ relations })` deletes a user's
 * tuples from.
 *
 * ```ts
 * const access = permissions({ model, store: createDrizzleRelations(db) });
 * ```
 *
 * **A write of more than one tuple is a transaction**, `@nxgt/drizzle`'s
 * `withTransaction`: removals first, then additions, all or nothing. It is not
 * retried here — a write is idempotent, so the caller retries.
 */
export function createDrizzleRelations(
	db: PgDatabase,
	options: DrizzleAdapterOptions<'relations'> = {},
): RelationStore {
	const tables = options.tables ?? defineJanusTables();
	const context: RelationContext = { db, relations: tables.relations };
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('relations', operation, body);

	return {
		write: ({ add = [], remove = [] }) =>
			run$('write', () => write(context, add, remove)),
		has: (tuple) => run$('has', () => has(context, tuple)),
		findSubjectSets: (object, relation) =>
			run$('findSubjectSets', () => findSubjectSets(context, object, relation)),
		findEntities: (object, relation) =>
			run$('findEntities', () => findEntities(context, object, relation)),
		// The request is unpacked before `run$`, as `write`'s is and as it was
		// before the split, so a malformed request throws the caller's
		// TypeError at once instead of reading as an outage.
		findObjects: ({ type, relation, subject, after, limit }) =>
			run$('findObjects', () =>
				findObjects(context, { type, relation, subject, after, limit }),
			),
		deleteEntity: (entity) =>
			run$('deleteEntity', () => deleteEntity(context, entity)),
	};
}
