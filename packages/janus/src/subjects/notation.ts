import {
	type Entity,
	isSubjectSet,
	type RelationTuple,
	type Subject,
} from './subject';

/**
 * Zanzibar's notation, with typed subjects:
 *
 * ```
 * record:r1#viewer@staff:u1
 * record:r1#viewer@team:t1#member
 * ```
 *
 * It exists for **messages, logs and documentation**, not as a wire format:
 * nothing in this package parses a tuple off the network, and a tuple that
 * crosses a boundary crosses it as an object. Keeping the notation is worth it
 * because every piece of Zanzibar writing uses it, so an error message in it is
 * an error message a reader has already learned to read.
 *
 * A type holds no `:`, and no part holds `@`, `#` or a parenthesis, so a
 * subject set needs no parentheses: after the `@`, a `#` can only begin its
 * relation. {@link parseTuple} refuses a string where that would not hold,
 * rather than reading it two ways.
 */
export function formatEntity(entity: Entity): string {
	return `${entity.type}:${entity.id}`;
}

/** One subject: `staff:u1`, or `team:t1#member`. */
export function formatSubject(subject: Subject): string {
	return isSubjectSet(subject)
		? `${formatEntity(subject)}#${subject.relation}`
		: formatEntity(subject);
}

/** One relation tuple, in the notation above. */
export function formatTuple(tuple: RelationTuple): string {
	return `${formatEntity(tuple.object)}#${tuple.relation}@${formatSubject(tuple.subject)}`;
}

const TYPE = '([^:@#()]+)';
const ID = '([^@#()]+)';
const RELATION = '([^:@#()]+)';

const TUPLE = new RegExp(`^${TYPE}:${ID}#${RELATION}@(.+)$`);
const SUBJECT = new RegExp(`^${TYPE}:${ID}(?:#${RELATION})?$`);

/**
 * Reads a tuple back. Refuses, with a `TypeError`, a string that is not one —
 * a permission question built from a malformed string is a question whose
 * answer means nothing, and no request is behind it: the string came from a
 * developer's own code.
 */
export function parseTuple(text: string): RelationTuple {
	const match = TUPLE.exec(text);

	if (!match) {
		throw new TypeError(
			`parseTuple: "${text}" is not a relation tuple; expected type:id#relation@subject`,
		);
	}

	const [, type, id, relation, subject] = match as unknown as [
		string,
		string,
		string,
		string,
		string,
	];

	return { object: { type, id }, relation, subject: parseSubject(subject) };
}

/** Reads one subject back: `staff:u1`, or `team:t1#member`. */
export function parseSubject(text: string): Subject {
	const match = SUBJECT.exec(text);

	if (!match) {
		throw new TypeError(
			`parseSubject: "${text}" is not a subject; expected type:id, or type:id#relation for a subject set`,
		);
	}

	const [, type, id, relation] = match as unknown as [
		string,
		string,
		string,
		string | undefined,
	];

	return relation === undefined ? { type, id } : { type, id, relation };
}
