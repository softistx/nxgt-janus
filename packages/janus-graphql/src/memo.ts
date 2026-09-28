/**
 * The per-request memo of permission checks: the same question asked twice
 * in one request — by two fields, by a directive and a resolver's `can()`,
 * or by two fields at once — is one call to `access.can`.
 */

import type { Check } from './context';

type Ref = {
	readonly type: string;
	readonly id: string;
	readonly relation?: unknown;
};

/**
 * What no id in a key may hold: the notation reads `@` and `#` as its own,
 * so a key built from such an id could be another question's. `can()`
 * refuses or denies such an id anyway; it is asked, not remembered.
 */
const NOTATION = /[@#]/;

/**
 * The key of one question, in the notation — `record:r1#view@staff:u1` —
 * or `null` when it is not remembered: an anonymous subject, which `can()`
 * answers `false` with no store call; a condition's `ctx`, which the key
 * does not hold; an id the notation could read two ways.
 */
function keyOf(
	subject: Ref | null,
	permission: string,
	object: Ref,
	options: { readonly ctx?: unknown } | undefined,
): string | null {
	if (subject === null || options?.ctx !== undefined) return null;
	if (NOTATION.test(object.id) || NOTATION.test(subject.id)) return null;
	const set =
		typeof subject.relation === 'string' ? `#${subject.relation}` : '';
	return `${object.type}:${object.id}#${permission}@${subject.type}:${subject.id}${set}`;
}

/**
 * `access.can` for one request, remembered: a question asked again answers
 * the first answer's promise, so two asked at once share one call. A
 * failure is not remembered — an outage is no answer, and the next question
 * asks again.
 */
export function memoized(access: { readonly can: unknown }): Check {
	const can = access.can as Check;
	const answers = new Map<string, Promise<boolean>>();
	const ask: Check = async (subject, permission, object, options) =>
		can.call(access, subject, permission, object, options);
	return (subject, permission, object, options) => {
		const key = keyOf(subject, permission, object, options);
		if (key === null) return ask(subject, permission, object, options);
		const known = answers.get(key);
		if (known !== undefined) return known;
		const answer = ask(subject, permission, object, options);
		answers.set(key, answer);
		answer.then(undefined, () => answers.delete(key));
		return answer;
	};
}
