import { formatTuple } from '../../subjects/notation';
import {
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type Subject,
	type SubjectSet,
} from '../../subjects/subject';
import type { RelationStore } from './types';

/**
 * The reference implementation of the relation store, in memory.
 *
 * **Shipped and documented, not a test helper**, like `createMemoryStores()`:
 * what a consumer uses in their own tests, and what an adapter author compares
 * against. It favours being obviously right over being fast — every query
 * scans — and keeps the rules for real:
 *
 * - a tuple is unique because its key is its notation, and one `Map` holds it;
 * - `write` checks nothing it could fail on half-way, so it is all or nothing
 *   on one event loop;
 * - every tuple is copied in and out, so a caller cannot reach the store by
 *   mutating what it passed or got back.
 */
export function createMemoryRelations(): RelationStore {
	const tuples = new Map<string, RelationTuple>();

	const sameEntity = (a: Entity, b: Entity) =>
		a.type === b.type && a.id === b.id;
	const sameSubject = (a: Subject, b: Subject) =>
		sameEntity(a, b) &&
		(isSubjectSet(a)
			? isSubjectSet(b) && a.relation === b.relation
			: !isSubjectSet(b));
	const on = (tuple: RelationTuple, object: Entity, relation: string) =>
		tuple.relation === relation && sameEntity(tuple.object, object);

	return {
		async write({ add = [], remove = [] }) {
			for (const tuple of remove) tuples.delete(formatTuple(tuple));
			for (const tuple of add) tuples.set(formatTuple(tuple), copyTuple(tuple));
		},

		async has(tuple) {
			return tuples.has(formatTuple(tuple));
		},

		async findSubjectSets(object, relation) {
			const sets: SubjectSet[] = [];
			for (const tuple of tuples.values()) {
				if (on(tuple, object, relation) && isSubjectSet(tuple.subject)) {
					sets.push(copySubject(tuple.subject) as SubjectSet);
				}
			}
			return sets;
		},

		async findEntities(object, relation) {
			const entities: Entity[] = [];
			for (const tuple of tuples.values()) {
				if (on(tuple, object, relation) && !isSubjectSet(tuple.subject)) {
					entities.push(copySubject(tuple.subject));
				}
			}
			return entities;
		},

		async findObjects({ type, relation, subject, after, limit }) {
			const ids = [
				...new Set(
					[...tuples.values()]
						.filter(
							(tuple) =>
								tuple.object.type === type &&
								tuple.relation === relation &&
								sameSubject(tuple.subject, subject) &&
								(after === null || tuple.object.id > after),
						)
						.map((tuple) => tuple.object.id),
				),
			].sort();
			const items = ids.slice(0, limit);
			const last = items.at(-1);

			return {
				items,
				nextCursor: ids.length > limit && last !== undefined ? last : null,
			};
		},

		async deleteEntity(entity) {
			let deleted = 0;
			for (const [key, tuple] of tuples) {
				if (
					sameEntity(tuple.object, entity) ||
					sameEntity(tuple.subject, entity)
				) {
					tuples.delete(key);
					deleted += 1;
				}
			}
			return deleted;
		},
	};
}

/** Field by field, so nothing but the declared shape reaches the store. */
function copySubject(subject: Subject): Subject {
	return isSubjectSet(subject)
		? { type: subject.type, id: subject.id, relation: subject.relation }
		: { type: subject.type, id: subject.id };
}

function copyTuple(tuple: RelationTuple): RelationTuple {
	return {
		object: { type: tuple.object.type, id: tuple.object.id },
		relation: tuple.relation,
		subject: copySubject(tuple.subject),
	};
}
