import { index, unique } from 'drizzle-orm/pg-core';
import { key, type TableOf } from './columns';

/**
 * Permission tuples, one row each: `record:r1#owners@patient:u1`, or
 * `…@team:t1#members` for a subject set, whose `subject_relation` an
 * entity's row leaves `null`.
 *
 * **The uniqueness of a tuple is the unique constraint**, `nulls not
 * distinct` so two rows for one entity collide — PostgreSQL 15 or later.
 * Its column order is the reverse index `findObjects` pages: every equality
 * first, the object id last.
 */
export function relationsTable(table: TableOf) {
	return table(
		'relations',
		{
			objectType: key('object_type').notNull(),
			objectId: key('object_id').notNull(),
			relation: key('relation').notNull(),
			subjectType: key('subject_type').notNull(),
			subjectId: key('subject_id').notNull(),
			subjectRelation: key('subject_relation'),
		},
		(t) => [
			unique('relations_tuple_unique')
				.on(
					t.subjectType,
					t.subjectId,
					t.subjectRelation,
					t.relation,
					t.objectType,
					t.objectId,
				)
				.nullsNotDistinct(),
			/** One hop forwards: `findSubjectSets`, `findEntities`, `deleteEntity` as the object. */
			index('relations_object').on(t.objectType, t.objectId, t.relation),
		],
	);
}
