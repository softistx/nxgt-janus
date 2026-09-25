import { type PgDatabase, withTransaction } from '@nxgt/drizzle/pg';
import {
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type Subject,
	type SubjectSet,
} from '@nxgt/janus';
import type { RelationStore } from '@nxgt/janus/permissions';
import { and, asc, eq, gt, isNotNull, isNull, or, type SQL } from 'drizzle-orm';
import { janusRelations } from './tables';
import { run } from './translate';

/**
 * The relation store `permissions()` takes, over one PostgreSQL database
 * through Drizzle — and the one `janus({ relations })` deletes a user's
 * tuples from.
 *
 * ```ts
 * const access = permissions({ model, store: createDrizzleRelations(db) });
 * ```
 *
 * **A write of more than one tuple is a transaction**, `@nxgt/drizzle`'s
 * `withTransaction`: removals first, then additions, all or nothing. It is not
 * retried here — a write is idempotent, so the caller retries.
 */
export function createDrizzleRelations(db: PgDatabase): RelationStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('relations', operation, body);

	/** One hop from an object: its subject sets, or its entities. */
	const holding = (object: Entity, relation: string, sets: boolean) =>
		db
			.select({
				type: janusRelations.subjectType,
				id: janusRelations.subjectId,
				relation: janusRelations.subjectRelation,
			})
			.from(janusRelations)
			.where(
				and(
					eq(janusRelations.objectType, object.type),
					eq(janusRelations.objectId, object.id),
					eq(janusRelations.relation, relation),
					sets
						? isNotNull(janusRelations.subjectRelation)
						: isNull(janusRelations.subjectRelation),
				),
			);

	const apply = async (
		tx: PgDatabase,
		add: readonly RelationTuple[],
		remove: readonly RelationTuple[],
	) => {
		for (const tuple of remove) {
			await tx.delete(janusRelations).where(matching(tuple));
		}
		if (add.length > 0) {
			// A stored tuple meets the unique constraint, and is a no-op.
			await tx
				.insert(janusRelations)
				.values(add.map(rowOf))
				.onConflictDoNothing();
		}
	};

	return {
		write: ({ add = [], remove = [] }) =>
			run$('write', async () => {
				if (add.length + remove.length <= 1) return apply(db, add, remove);
				await withTransaction(db, (tx) => apply(tx, add, remove));
			}),

		has: (tuple) =>
			run$('has', async () => {
				const found = await db
					.select({ relation: janusRelations.relation })
					.from(janusRelations)
					.where(matching(tuple))
					.limit(1);
				return found.length === 1;
			}),

		findSubjectSets: (object, relation) =>
			run$('findSubjectSets', async () =>
				(await holding(object, relation, true)).map(
					(row): SubjectSet => ({
						type: row.type,
						id: row.id,
						relation: row.relation ?? '',
					}),
				),
			),

		findEntities: (object, relation) =>
			run$('findEntities', async () =>
				(await holding(object, relation, false)).map(
					(row): Entity => ({ type: row.type, id: row.id }),
				),
			),

		findObjects: ({ type, relation, subject, after, limit }) =>
			run$('findObjects', async () => {
				const conditions = [
					subjectIs(subject),
					eq(janusRelations.relation, relation),
					eq(janusRelations.objectType, type),
				];
				if (after !== null) conditions.push(gt(janusRelations.objectId, after));
				const found = await db
					.select({ id: janusRelations.objectId })
					.from(janusRelations)
					.where(and(...conditions))
					.orderBy(asc(janusRelations.objectId))
					.limit(limit + 1);
				const items = found.slice(0, limit).map((row) => row.id);
				const last = items.at(-1);
				return {
					items,
					nextCursor: found.length > limit && last !== undefined ? last : null,
				};
			}),

		deleteEntity: (entity) =>
			run$('deleteEntity', async () => {
				const deleted = await db
					.delete(janusRelations)
					.where(
						or(
							and(
								eq(janusRelations.objectType, entity.type),
								eq(janusRelations.objectId, entity.id),
							),
							and(
								eq(janusRelations.subjectType, entity.type),
								eq(janusRelations.subjectId, entity.id),
							),
						),
					)
					.returning({ relation: janusRelations.relation });
				return deleted.length;
			}),
	};
}

/** A tuple as a row: an entity's `subject_relation` is `null`. */
function rowOf(tuple: RelationTuple): typeof janusRelations.$inferInsert {
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
function subjectIs(subject: Subject): SQL | undefined {
	return and(
		eq(janusRelations.subjectType, subject.type),
		eq(janusRelations.subjectId, subject.id),
		isSubjectSet(subject)
			? eq(janusRelations.subjectRelation, subject.relation)
			: isNull(janusRelations.subjectRelation),
	);
}

/** Exactly this tuple. */
function matching(tuple: RelationTuple): SQL | undefined {
	return and(
		eq(janusRelations.objectType, tuple.object.type),
		eq(janusRelations.objectId, tuple.object.id),
		eq(janusRelations.relation, tuple.relation),
		subjectIs(tuple.subject),
	);
}
