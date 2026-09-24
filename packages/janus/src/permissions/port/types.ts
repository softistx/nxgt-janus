/**
 * The relation store port: where tuples live, and nothing else.
 *
 * **A port of its own, not a fourth slot of `JanusStores`** (decided
 * 2026-09-24): an application that only authenticates implements nothing
 * here, and tuples may live somewhere else than users.
 *
 * Small on purpose, like the user port: the traversal — subject sets, arrows,
 * `fromField`, conditions, depth — is the core's, written once. A store answers
 * one-hop questions about stored tuples and never evaluates a permission.
 *
 * ## The rules an implementation keeps
 *
 * The user port's six hold here unchanged, and the conformance suite checks
 * them: **an absence is `false`, `[]`, an empty page or `0`, and a failure
 * throws** — a store that answers `false` for an outage denies everybody
 * everything, silently; `null` or `false`, never `undefined`; uniqueness of a
 * tuple is a constraint, not a read; bytes round-trip — a type, an id and a
 * relation come back exactly as written, and `staff:u1` is not `patient:u1`;
 * every method is atomic on its own; schema management is the adapter's own.
 */

import type { CursorPage } from '../../pagination/cursor-page';
import type {
	Entity,
	RelationTuple,
	Subject,
	SubjectSet,
} from '../../subjects/subject';

/** What one {@link RelationStore.write} changes. */
export interface RelationChanges {
	readonly add?: readonly RelationTuple[];
	readonly remove?: readonly RelationTuple[];
}

/** Which objects a page lists: those of one type where a subject holds a relation. */
export interface ObjectPageRequest {
	readonly type: string;
	readonly relation: string;
	/** Compared exactly: a subject set is not its entity, and the reverse. */
	readonly subject: Subject;
	/**
	 * The last object id of the previous page, or `null` for the first. It need
	 * not name a stored object: the page is every id strictly greater than it.
	 */
	readonly after: string | null;
	/** Already bounded by the core, between 1 and `MAX_PAGE_SIZE`. */
	readonly limit: number;
}

export interface RelationStore {
	/**
	 * Adds and removes tuples, **all or nothing**: removals first, then
	 * additions. Idempotent: adding a tuple already stored and removing one
	 * that is not are no-ops, so a retry after a timeout is a success.
	 *
	 * The core never sends one tuple in both lists.
	 */
	write(changes: RelationChanges): Promise<void>;

	/** Whether exactly this tuple is stored. */
	has(tuple: RelationTuple): Promise<boolean>;

	/**
	 * The subject sets holding `relation` on `object` — `team:t1#member` — and
	 * no single entity. What the traversal follows to reach members of a group.
	 * `[]` when none; unordered; unpaged, because a relation is held by few sets.
	 */
	findSubjectSets(
		object: Entity,
		relation: string,
	): Promise<readonly SubjectSet[]>;

	/**
	 * The single entities holding `relation` on `object`, and no subject set.
	 * What an arrow follows — a record's team, a folder's parent — which is why
	 * it is unpaged: an arrow relation holds a handful of objects. `[]` when
	 * none; unordered.
	 */
	findEntities(object: Entity, relation: string): Promise<readonly Entity[]>;

	/**
	 * The ids of the objects of one type on which `subject` holds `relation`
	 * directly, in ascending id order, by pages. The reverse index `list()`
	 * walks. An empty store answers an empty page, never `null`.
	 */
	findObjects(page: ObjectPageRequest): Promise<CursorPage<string>>;

	/**
	 * Deletes every tuple naming `entity` — as the object, as the subject, and
	 * as the entity of a subject set — and answers how many. `0` is an answer.
	 * What deleting a user or an object calls.
	 */
	deleteEntity(entity: Entity): Promise<number>;
}
