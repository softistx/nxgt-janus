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
import {
	type DrizzleAdapterOptions,
	defineJanusTables,
	type JanusTables,
} from './tables';
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
export function createDrizzleRelations(
	db: PgDatabase,
	options: DrizzleAdapterOptions<'relations'> = {},
): RelationStore {
	const tables = options.tables ?? defineJanusTables();
	const { rowOf, subjectIs, matching } = tupleSql(tables.relations);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('relations', operation, body);

	/** One hop from an object: its subject sets, or its entities. */
	const holding = (object: Entity, relation: string, sets: boolean) =>
		db
			.select({
				type: tables.relations.subjectType,
				id: tables.relations.subjectId,
				relation: tables.relations.subjectRelation,
			})
			.from(tables.relations)
			.where(
				and(
					eq(tables.relations.objectType, object.type),
					eq(tables.relations.objectId, object.id),
					eq(tables.relations.relation, relation),
					sets
						? isNotNull(tables.relations.subjectRelation)
						: isNull(tables.relations.subjectRelation),
				),
			);

	const apply = async (
		tx: PgDatabase,
		add: readonly RelationTuple[],
		remove: readonly RelationTuple[],
	) => {
		// In one order, so two writes touching the same tuples take their locks
		// alike and never deadlock.
		for (const tuple of inOrder(remove)) {
			await tx.delete(tables.relations).where(matching(tuple));
		}
		if (add.length > 0) {
			// A stored tuple meets the unique constraint, and is a no-op.
			await tx
				.insert(tables.relations)
				.values(inOrder(add).map(rowOf))
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
					.select({ relation: tables.relations.relation })
					.from(tables.relations)
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
					eq(tables.relations.relation, relation),
					eq(tables.relations.objectType, type),
				];
				if (after !== null)
					conditions.push(gt(tables.relations.objectId, after));
				const found = await db
					.select({ id: tables.relations.objectId })
					.from(tables.relations)
					.where(and(...conditions))
					.orderBy(asc(tables.relations.objectId))
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
					.delete(tables.relations)
					.where(
						or(
							and(
								eq(tables.relations.objectType, entity.type),
								eq(tables.relations.objectId, entity.id),
							),
							and(
								eq(tables.relations.subjectType, entity.type),
								eq(tables.relations.subjectId, entity.id),
							),
						),
					)
					.returning({ relation: tables.relations.relation });
				return deleted.length;
			}),
	};
}

/** Tuples in one order: their notation, compared by code unit. */
function inOrder(tuples: readonly RelationTuple[]): readonly RelationTuple[] {
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

type Relations = JanusTables['relations'];

/** The SQL of one tuple, over the `relations` table in use. */
function tupleSql(relations: Relations) {
	/** A tuple as a row: an entity's `subject_relation` is `null`. */
	function rowOf(tuple: RelationTuple): Relations['$inferInsert'] {
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
			eq(relations.subjectType, subject.type),
			eq(relations.subjectId, subject.id),
			isSubjectSet(subject)
				? eq(relations.subjectRelation, subject.relation)
				: isNull(relations.subjectRelation),
		);
	}

	/** Exactly this tuple. */
	function matching(tuple: RelationTuple): SQL | undefined {
		return and(
			eq(relations.objectType, tuple.object.type),
			eq(relations.objectId, tuple.object.id),
			eq(relations.relation, tuple.relation),
			subjectIs(tuple.subject),
		);
	}

	return { rowOf, subjectIs, matching };
}
