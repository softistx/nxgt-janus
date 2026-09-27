import { mintId } from '../../ids/id';
import { formatSubject } from '../../subjects/notation';
import type {
	Entity,
	RelationTuple,
	Subject,
	SubjectSet,
} from '../../subjects/subject';

/** The tuples the relation cases write, and how they compare what comes back. */

export const entity = (type: string, id: string = mintId()): Entity => ({
	type,
	id,
});
export const set = (
	type: string,
	id: string,
	relation: string,
): SubjectSet => ({
	type,
	id,
	relation,
});
export const tuple = (
	object: Entity,
	relation: string,
	subject: Subject,
): RelationTuple => ({ object, relation, subject });

/** Order-free, so a store may answer in any order. */
export const sorted = (subjects: readonly Subject[]) =>
	subjects.map(formatSubject).sort();
