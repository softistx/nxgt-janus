import {
	isSubjectSet,
	type RelationTuple,
	type Subject,
	type SubjectSet,
} from './subject';

/**
 * Zanzibar's own notation, which Keto also uses:
 *
 * ```
 * Note:1#viewers@alice
 * Note:1#viewers@(Group:eng#members)
 * ```
 *
 * It exists for **messages, logs and documentation**, not as a wire format:
 * nothing in this package parses a tuple off the network, and a tuple that
 * crosses a boundary crosses it as an object. Keeping the notation is worth it
 * because every piece of Zanzibar writing uses it, so an error message in it is
 * an error message a reader has already learned to read.
 *
 * The parentheses around a subject set are this package's, not Keto's — Keto
 * writes `@Group:eng#members` bare. Without them, `Note:1#viewers@Group:eng`
 * and a subject id that happens to contain a colon are ambiguous, and a
 * notation that cannot round-trip is a notation that lies in a log.
 */
export function formatSubject(subject: Subject): string {
	if (!isSubjectSet(subject)) return subject;
	const { namespace, object, relation } = subject.subjectSet;
	return `(${namespace}:${object}#${relation})`;
}

/** One relation tuple, in the notation above. */
export function formatTuple(tuple: RelationTuple): string {
	return `${tuple.namespace}:${tuple.object}#${tuple.relation}@${formatSubject(
		tuple.subject,
	)}`;
}

/** A subject set, without its parentheses: `Group:eng#members`. */
export function formatSubjectSet(set: SubjectSet): string {
	return `${set.namespace}:${set.object}#${set.relation}`;
}

const TUPLE = /^([^:@#()]+):([^@#()]+)#([^@#()]+)@(.+)$/;
const SUBJECT_SET = /^\(([^:@#()]+):([^@#()]+)#([^@#()]+)\)$/;

/**
 * Reads back what {@link formatTuple} wrote.
 *
 * Refuses anything else with a `TypeError` naming what it was given, rather than
 * returning a half-parsed tuple: a permission question built from a malformed
 * string is a question whose answer means nothing.
 *
 * It is a bare `TypeError` and not a `JanusError` because there is no request
 * behind it. Nothing in this package reads a tuple off the network, so a string
 * reaching here came from a developer's own code, a test fixture or a script —
 * which is a wiring mistake, and no handler should answer one.
 */
export function parseTuple(text: string): RelationTuple {
	const match = TUPLE.exec(text);

	if (!match) {
		throw new TypeError(
			`parseTuple: "${text}" is not a relation tuple; expected namespace:object#relation@subject`,
		);
	}

	const [, namespace, object, relation, subject] = match as unknown as [
		string,
		string,
		string,
		string,
		string,
	];

	return { namespace, object, relation, subject: parseSubject(subject) };
}

/** A subject id, or a parenthesised subject set. */
export function parseSubject(text: string): Subject {
	const set = SUBJECT_SET.exec(text);
	if (!set) {
		if (text.includes('#')) {
			// Keto's own bare form. Refused rather than accepted, because
			// accepting it would make the notation ambiguous with a subject id
			// containing a `#`, and a tuple that parses two ways is worse than one
			// that refuses.
			throw new TypeError(
				`parseSubject: "${text}" looks like a subject set; write it in parentheses, as (namespace:object#relation)`,
			);
		}
		return text;
	}

	const [, namespace, object, relation] = set as unknown as [
		string,
		string,
		string,
		string,
	];

	return { subjectSet: { namespace, object, relation } };
}
