import type {
	CursorPage,
	Entity,
	RelationTuple,
	SubjectSet,
} from '@nxgt/janus';
import {
	type HolderPageRequest,
	holderCursor,
	type ObjectPageRequest,
	readHolderCursor,
} from '@nxgt/janus/permissions';
import {
	and,
	asc,
	eq,
	gt,
	isNotNull,
	isNull,
	or,
	type SQL,
	sql,
} from 'drizzle-orm';
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

/**
 * A page of the entities holding a relation, by type then id, after the
 * cursor, whose id contains the search (`strpos`, so a literal, and `lower`,
 * which folds ASCII under the `C` collation the columns use).
 */
export async function findHolders(
	{ db, relations }: RelationContext,
	{ object, relation, after, limit, search }: HolderPageRequest,
): Promise<CursorPage<Entity>> {
	const from = after === null ? null : readHolderCursor('findHolders', after);
	const conditions: (SQL | undefined)[] = [
		eq(relations.objectType, object.type),
		eq(relations.objectId, object.id),
		eq(relations.relation, relation),
		isNull(relations.subjectRelation),
	];
	if (search !== null) {
		conditions.push(
			sql`strpos(lower(${relations.subjectId}), lower(${search})) > 0`,
		);
	}
	if (from !== null) {
		conditions.push(
			or(
				gt(relations.subjectType, from.type),
				and(
					eq(relations.subjectType, from.type),
					gt(relations.subjectId, from.id),
				),
			),
		);
	}
	const found = await db
		.select({ type: relations.subjectType, id: relations.subjectId })
		.from(relations)
		.where(and(...conditions))
		.orderBy(asc(relations.subjectType), asc(relations.subjectId))
		.limit(limit + 1);
	const items = found
		.slice(0, limit)
		.map((row): Entity => ({ type: row.type, id: row.id }));
	const last = items.at(-1);
	return {
		items,
		nextCursor:
			found.length > limit && last !== undefined ? holderCursor(last) : null,
	};
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
