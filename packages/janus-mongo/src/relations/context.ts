import type { TypedCollection } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import type { relations } from './collection';

export type Relations = TypedCollection<typeof relations>['raw'];

/**
 * What every step queries: the database, which starts a write's session, and
 * the driver's own `relations` collection.
 */
export interface RelationContext {
	readonly db: Db;
	readonly collection: Relations;
}
