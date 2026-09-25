import type { JanusStores } from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import {
	type SyncOptions,
	type SyncReport,
	syncCollections,
} from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { janusCollections } from './collections';
import { createMongoRelations, relations } from './relations';
import { createMongoStores } from './stores';

/** The whole adapter over one database, keyed as `janus()` takes it. */
export interface MongoAdapter {
	/** The identity stores: `createMongoStores(db)`. */
	readonly store: JanusStores;
	/** The relation store: `createMongoRelations(db)`. */
	readonly relations: RelationStore;
}

/**
 * The identity stores and the relation store over one database, under the
 * names `janus()` takes them — so one spread wires both, and deleting a user
 * deletes every tuple naming them:
 *
 * ```ts
 * const mongo = createMongoAdapter(db);
 * const auth = janus({ user, password: { login: 'email' }, hasher, ...mongo });
 * const access = permissions({ model, store: mongo.relations });
 * ```
 *
 * It connects to nothing and sends nothing, as the two it combines. An
 * application that only authenticates can take `createMongoStores(db)` alone.
 */
export function createMongoAdapter(db: Db): MongoAdapter {
	return { store: createMongoStores(db), relations: createMongoRelations(db) };
}

/**
 * Creates the four collections, their validators and their indexes, and says
 * what it changed: `syncMongoStores` and `syncMongoRelations` in one
 * deployment step. Run it twice and the second run sends nothing.
 */
export function syncMongoAdapter(
	db: Db,
	options?: SyncOptions,
): Promise<SyncReport[]> {
	return syncCollections(db, [...janusCollections, relations], options);
}
