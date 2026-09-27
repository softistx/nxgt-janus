import type { RelationStore } from '@nxgt/janus/permissions';
import {
	getCollection,
	type SyncOptions,
	type SyncReport,
	syncCollections,
} from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { run } from '../translate';
import { relations } from './collection';
import type { RelationContext } from './context';
import { findEntities, findObjects, findSubjectSets, has } from './reads';
import { deleteEntity, write } from './writes';

export { relations } from './collection';

/**
 * The relation store `permissions()` takes, over one MongoDB database — and
 * the one `janus({ relations })` deletes a user's tuples from.
 *
 * ```ts
 * await syncMongoRelations(db); // a deployment step: creates the indexes
 * const access = permissions({ model, store: createMongoRelations(db) });
 * ```
 *
 * **A write of more than one tuple is a transaction**, which MongoDB runs on
 * a replica set only — as every production deployment is. `grant` and
 * `revoke` write one tuple, and run anywhere. The transaction is not retried
 * here: the driver's `withTransaction` would retry an outage for two minutes
 * before answering, and a write is idempotent, so the caller retries.
 */
export function createMongoRelations(db: Db): RelationStore {
	const context: RelationContext = {
		db,
		collection: getCollection(db, relations).raw,
	};
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
		// Unpacked before `run$`, as `write`'s is and as on develop, so a
		// malformed request throws instead of reading as an outage.
		findObjects: ({ type, relation, subject, after, limit }) =>
			run$('findObjects', () =>
				findObjects(context, { type, relation, subject, after, limit }),
			),
		deleteEntity: (entity) =>
			run$('deleteEntity', () => deleteEntity(context, entity)),
	};
}

/**
 * Creates the collection and its indexes, and says what it changed. A
 * deployment step, as `syncMongoStores` is — and a separate one, because an
 * application that only authenticates keeps no tuples.
 */
export function syncMongoRelations(
	db: Db,
	options?: SyncOptions,
): Promise<SyncReport[]> {
	return syncCollections(db, [relations], options);
}
