import { type PgDatabase, withTransaction } from '@nxgt/drizzle/pg';
import type { Entity, RelationTuple } from '@nxgt/janus';
import { and, eq, or } from 'drizzle-orm';
import type { RelationContext, Relations } from './context';
import { inOrder, matching, rowOf } from './tuples';

/** One tuple in one statement; more in one transaction. */
export async function write(
	{ db, relations }: RelationContext,
	add: readonly RelationTuple[],
	remove: readonly RelationTuple[],
): Promise<void> {
	if (add.length + remove.length <= 1) return apply(db, relations, add, remove);
	await withTransaction(db, (tx) => apply(tx, relations, add, remove));
}

/** Removals first, then additions. */
async function apply(
	tx: PgDatabase,
	relations: Relations,
	add: readonly RelationTuple[],
	remove: readonly RelationTuple[],
): Promise<void> {
	// In one order, so two writes touching the same tuples take their locks
	// alike and never deadlock.
	for (const tuple of inOrder(remove)) {
		await tx.delete(relations).where(matching(relations, tuple));
	}
	if (add.length > 0) {
		// A stored tuple meets the unique constraint, and is a no-op.
		await tx
			.insert(relations)
			.values(inOrder(add).map(rowOf))
			.onConflictDoNothing();
	}
}

/** Every tuple naming the entity, as object or as subject. */
export async function deleteEntity(
	{ db, relations }: RelationContext,
	entity: Entity,
): Promise<number> {
	const deleted = await db
		.delete(relations)
		.where(
			or(
				and(
					eq(relations.objectType, entity.type),
					eq(relations.objectId, entity.id),
				),
				and(
					eq(relations.subjectType, entity.type),
					eq(relations.subjectId, entity.id),
				),
			),
		)
		.returning({ relation: relations.relation });
	return deleted.length;
}
