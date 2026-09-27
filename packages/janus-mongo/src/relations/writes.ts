import type { Entity, RelationTuple } from '@nxgt/janus';
import type { ClientSession } from 'mongodb';
import type { Key } from './collection';
import type { RelationContext, Relations } from './context';
import { keyOf } from './tuples';

/** One tuple in one driver call; more in one transaction. */
export async function write(
	{ db, collection }: RelationContext,
	add: readonly RelationTuple[],
	remove: readonly RelationTuple[],
): Promise<void> {
	const removals = remove.map(keyOf);
	const additions = add.map(keyOf);

	if (removals.length + additions.length <= 1) {
		return apply(collection, additions, removals);
	}

	const session = db.client.startSession();
	try {
		session.startTransaction();
		await apply(collection, additions, removals, session);
		await session.commitTransaction();
	} finally {
		// Ends — and so aborts — a transaction that did not commit.
		await session.endSession();
	}
}

/** Removals first, then additions. */
async function apply(
	collection: Relations,
	additions: Key[],
	removals: Key[],
	session?: ClientSession,
): Promise<void> {
	if (removals.length > 0) {
		await collection.deleteMany(
			{ _id: { $in: removals } },
			session === undefined ? {} : { session },
		);
	}
	if (additions.length > 0) {
		// A replace of a document by itself: a stored tuple is a no-op,
		// an absent one is inserted, and concurrent writers of one
		// tuple meet on the `_id` index, which the server retries.
		await collection.bulkWrite(
			additions.map((key) => ({
				replaceOne: {
					filter: { _id: key },
					replacement: { _id: key },
					upsert: true,
				},
			})),
			session === undefined ? {} : { session },
		);
	}
}

/** Every tuple naming the entity, as object or as subject. */
export async function deleteEntity(
	{ collection }: RelationContext,
	entity: Entity,
): Promise<number> {
	const result = await collection.deleteMany({
		$or: [
			{ '_id.object.type': entity.type, '_id.object.id': entity.id },
			{ '_id.subject.type': entity.type, '_id.subject.id': entity.id },
		],
	});
	return result.deletedCount;
}
