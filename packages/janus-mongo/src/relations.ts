import {
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type Subject,
	type SubjectSet,
} from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import {
	type DocumentOf,
	defineCollection,
	getCollection,
	type SyncOptions,
	type SyncReport,
	syncCollections,
} from '@nxgt/mongo';
import type { ClientSession, Db, Filter } from 'mongodb';
import { z } from 'zod';
import { run } from './translate';

/**
 * The tuples, one document each, **keyed by the tuple itself**:
 * `{ _id: { object: { type, id }, relation, subject: { type, id, relation? } } }`.
 *
 * The key is the port's `RelationTuple`, as written, so uniqueness is the
 * `_id` index every collection has — a constraint, never a read — an insert
 * of a stored tuple is a retry, and a document read in a shell is the tuple
 * in the code. A subject set carries `relation`, an entity does not, so
 * `team:t1#members` and `team:t1` are two keys.
 *
 * The key is always built by {@link keyOf}, in one field order: MongoDB
 * compares embedded documents field by field, in order.
 */
export const relations = defineCollection({
	name: 'relations',
	schema: z.object({
		_id: z.object({
			object: z.object({ type: z.string(), id: z.string() }),
			relation: z.string(),
			subject: z.object({
				type: z.string(),
				id: z.string(),
				relation: z.string().optional(),
			}),
		}),
	}),
	indexes: [
		/** One hop forwards: `findSubjectSets`, `findEntities`, and `deleteEntity` as the object. */
		{
			key: { '_id.object.type': 1, '_id.object.id': 1, '_id.relation': 1 },
			name: 'objectRelation',
		},
		/**
		 * The reverse index `list()` walks, in the order `findObjects` pages it:
		 * every equality first, the object id last. Its prefix is `deleteEntity`
		 * as a subject. An entity has no `subject.relation`, which the index
		 * holds as `null` and `findObjects` asks for as `null`.
		 */
		{
			key: {
				'_id.subject.type': 1,
				'_id.subject.id': 1,
				'_id.subject.relation': 1,
				'_id.relation': 1,
				'_id.object.type': 1,
				'_id.object.id': 1,
			},
			name: 'subjectObjects',
		},
	],
});

type RelationDocument = DocumentOf<typeof relations>;
type Key = RelationDocument['_id'];

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
	const collection = getCollection(db, relations).raw;
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('relations', operation, body);

	/** One hop from an object: its subject sets, or its entities. */
	const holding = async (object: Entity, relation: string, sets: boolean) =>
		(
			await collection
				.find({
					'_id.object.type': object.type,
					'_id.object.id': object.id,
					'_id.relation': relation,
					'_id.subject.relation': { $exists: sets },
				})
				.toArray()
		).map((document) => document._id.subject);

	return {
		write: ({ add = [], remove = [] }) =>
			run$('write', async () => {
				const removals = remove.map(keyOf);
				const additions = add.map(keyOf);
				const apply = async (session?: ClientSession) => {
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
				};

				if (removals.length + additions.length <= 1) return apply();

				const session = db.client.startSession();
				try {
					session.startTransaction();
					await apply(session);
					await session.commitTransaction();
				} finally {
					// Ends — and so aborts — a transaction that did not commit.
					await session.endSession();
				}
			}),

		has: (tuple) =>
			run$(
				'has',
				async () =>
					(await collection.findOne(
						{ _id: keyOf(tuple) },
						{ projection: { _id: 1 } },
					)) !== null,
			),

		findSubjectSets: (object, relation) =>
			run$('findSubjectSets', async () =>
				(await holding(object, relation, true)).map(
					(subject): SubjectSet => ({
						type: subject.type,
						id: subject.id,
						relation: subject.relation as string,
					}),
				),
			),

		findEntities: (object, relation) =>
			run$('findEntities', async () =>
				(await holding(object, relation, false)).map(
					(subject): Entity => ({ type: subject.type, id: subject.id }),
				),
			),

		findObjects: ({ type, relation, subject, after, limit }) =>
			run$('findObjects', async () => {
				const filter: Filter<RelationDocument> = {
					'_id.subject.type': subject.type,
					'_id.subject.id': subject.id,
					// `null` matches the missing field: an entity, not a set.
					'_id.subject.relation': isSubjectSet(subject)
						? subject.relation
						: null,
					'_id.relation': relation,
					'_id.object.type': type,
					...(after === null ? {} : { '_id.object.id': { $gt: after } }),
				};
				const found = await collection
					.find(filter, { projection: { '_id.object.id': 1 } })
					.sort({ '_id.object.id': 1 })
					.limit(limit + 1)
					.toArray();
				const items = found
					.slice(0, limit)
					.map((document) => document._id.object.id);
				const last = items.at(-1);
				return {
					items,
					nextCursor: found.length > limit && last !== undefined ? last : null,
				};
			}),

		deleteEntity: (entity) =>
			run$('deleteEntity', async () => {
				const result = await collection.deleteMany({
					$or: [
						{ '_id.object.type': entity.type, '_id.object.id': entity.id },
						{ '_id.subject.type': entity.type, '_id.subject.id': entity.id },
					],
				});
				return result.deletedCount;
			}),
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

/** The `_id` of a tuple, in the one field order MongoDB compares. */
function keyOf(tuple: RelationTuple): Key {
	return {
		object: { type: tuple.object.type, id: tuple.object.id },
		relation: tuple.relation,
		subject: subjectKey(tuple.subject),
	};
}

function subjectKey(subject: Subject): Key['subject'] {
	return isSubjectSet(subject)
		? { type: subject.type, id: subject.id, relation: subject.relation }
		: { type: subject.type, id: subject.id };
}
