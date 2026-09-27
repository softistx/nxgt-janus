import { type DocumentOf, defineCollection } from '@nxgt/mongo';
import { z } from 'zod';

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
 * The key is always built by `keyOf`, in `./tuples`, in one field order: MongoDB
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

export type RelationDocument = DocumentOf<typeof relations>;
export type Key = RelationDocument['_id'];
