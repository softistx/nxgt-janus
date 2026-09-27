import { isSubjectSet, type RelationTuple, type Subject } from '@nxgt/janus';
import { and, eq, isNull, type SQL } from 'drizzle-orm';
import type { Relations } from './context';

/** Tuples in one order: their notation, compared by code unit. */
export function inOrder(
	tuples: readonly RelationTuple[],
): readonly RelationTuple[] {
	const keyOf = (tuple: RelationTuple) =>
		JSON.stringify([
			tuple.object.type,
			tuple.object.id,
			tuple.relation,
			tuple.subject.type,
			tuple.subject.id,
			isSubjectSet(tuple.subject) ? tuple.subject.relation : null,
		]);
	return [...tuples].sort((a, b) => {
		const [x, y] = [keyOf(a), keyOf(b)];
		return x < y ? -1 : x > y ? 1 : 0;
	});
}

/** A tuple as a row: an entity's `subject_relation` is `null`. */
export function rowOf(tuple: RelationTuple): Relations['$inferInsert'] {
	return {
		objectType: tuple.object.type,
		objectId: tuple.object.id,
		relation: tuple.relation,
		subjectType: tuple.subject.type,
		subjectId: tuple.subject.id,
		subjectRelation: isSubjectSet(tuple.subject)
			? tuple.subject.relation
			: null,
	};
}

/** Exactly this subject: a subject set is not its entity, and the reverse. */
export function subjectIs(
	relations: Relations,
	subject: Subject,
): SQL | undefined {
	return and(
		eq(relations.subjectType, subject.type),
		eq(relations.subjectId, subject.id),
		isSubjectSet(subject)
			? eq(relations.subjectRelation, subject.relation)
			: isNull(relations.subjectRelation),
	);
}

/** Exactly this tuple. */
export function matching(
	relations: Relations,
	tuple: RelationTuple,
): SQL | undefined {
	return and(
		eq(relations.objectType, tuple.object.type),
		eq(relations.objectId, tuple.object.id),
		eq(relations.relation, tuple.relation),
		subjectIs(relations, tuple.subject),
	);
}
