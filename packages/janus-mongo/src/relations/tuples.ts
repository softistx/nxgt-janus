import { isSubjectSet, type RelationTuple, type Subject } from '@nxgt/janus';
import type { Key } from './collection';

/** The `_id` of a tuple, in the one field order MongoDB compares. */
export function keyOf(tuple: RelationTuple): Key {
	return {
		object: { type: tuple.object.type, id: tuple.object.id },
		relation: tuple.relation,
		subject: subjectKey(tuple.subject),
	};
}

function subjectKey(subject: Subject): Key['subject'] {
	return isSubjectSet(subject)
		? { type: subject.type, id: subject.id, relation: subject.relation }
		: { type: subject.type, id: subject.id };
}
