import type {
	CursorPage,
	Entity,
	RelationTuple,
	SubjectSet,
} from '@nxgt/janus';
import type { ObjectPageRequest } from '@nxgt/janus/permissions';
import { and, asc, eq, gt, isNotNull, isNull } from 'drizzle-orm';
import type { RelationContext } from './context';
import { matching, subjectIs } from './tuples';

export async function has(
	{ db, relations }: RelationContext,
	tuple: RelationTuple,
): Promise<boolean> {
	const found = await db
		.select({ relation: relations.relation })
		.from(relations)
		.where(matching(relations, tuple))
		.limit(1);
	return found.length === 1;
}

export async function findSubjectSets(
	context: RelationContext,
	object: Entity,
	relation: string,
): Promise<SubjectSet[]> {
	return (await holding(context, object, relation, true)).map(
		(row): SubjectSet => ({
			type: row.type,
			id: row.id,
			relation: row.relation ?? '',
		}),
	);
}

export async function findEntities(
	context: RelationContext,
	object: Entity,
	relation: string,
): Promise<Entity[]> {
	return (await holding(context, object, relation, false)).map(
		(row): Entity => ({ type: row.type, id: row.id }),
	);
}

/** One hop from an object: its subject sets, or its entities. */
function holding(
	{ db, relations }: RelationContext,
	object: Entity,
	relation: string,
	sets: boolean,
) {
	return db
		.select({
			type: relations.subjectType,
			id: relations.subjectId,
			relation: relations.subjectRelation,
		})
		.from(relations)
		.where(
			and(
				eq(relations.objectType, object.type),
				eq(relations.objectId, object.id),
				eq(relations.relation, relation),
				sets
					? isNotNull(relations.subjectRelation)
					: isNull(relations.subjectRelation),
			),
		);
}

/** A page of object ids, in id order, after the cursor. */
export async function findObjects(
	{ db, relations }: RelationContext,
	{ type, relation, subject, after, limit }: ObjectPageRequest,
): Promise<CursorPage<string>> {
	const conditions = [
		subjectIs(relations, subject),
		eq(relations.relation, relation),
		eq(relations.objectType, type),
	];
	if (after !== null) conditions.push(gt(relations.objectId, after));
	const found = await db
		.select({ id: relations.objectId })
		.from(relations)
		.where(and(...conditions))
		.orderBy(asc(relations.objectId))
		.limit(limit + 1);
	const items = found.slice(0, limit).map((row) => row.id);
	const last = items.at(-1);
	return {
		items,
		nextCursor: found.length > limit && last !== undefined ? last : null,
	};
}
