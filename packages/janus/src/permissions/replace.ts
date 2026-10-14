/** `replace()`: make the holders of one relation exactly a wanted list. */

import { isSubjectSet, type Subject } from '../subjects/subject';
import { targetOf, tupleOf } from './input';
import type { RelationStore } from './port/types';
import type { ResolvedModel } from './resolve/resolved';

/** A subject as an identity: an entity is not the set `type:id#relation`. */
const keyOf = (subject: Subject): string =>
	isSubjectSet(subject)
		? `set\0${subject.type}\0${subject.id}\0${subject.relation}`
		: `entity\0${subject.type}\0${subject.id}`;

/**
 * Makes `subjects` the only holders of `relation` on `object`: the missing
 * ones are added, the others removed, and what is already right is left alone.
 * Answers how many tuples were added and removed.
 *
 * Every subject is read first, as `grant` reads it, so a refusal writes
 * nothing. `[]` removes every holder. Duplicates count once, and a subject set
 * is not its entity. The current holders are read, then **one** `write` holds
 * the removals and the additions — all or nothing — and none when both are
 * empty.
 *
 * **Not serialised.** Two concurrent `replace` calls on the same object and
 * relation each read, then write their own diff, so the result can hold the
 * union of both adds. A caller that needs one winner serialises them itself.
 */
export async function replace(
	model: ResolvedModel,
	store: RelationStore,
	object: unknown,
	relation: string,
	subjects: unknown,
): Promise<{ added: number; removed: number }> {
	const where = 'replace';
	if (!Array.isArray(subjects)) {
		throw new TypeError(`${where}: the subjects must be an array`);
	}
	// An empty list still names an object and a relation: refuse a wrong one.
	const { entity } = targetOf(model, object, relation, where);
	const wanted = new Map<string, ReturnType<typeof tupleOf>>();
	for (const subject of subjects) {
		const tuple = tupleOf(model, object, relation, subject, where);
		wanted.set(keyOf(tuple.subject), tuple);
	}

	const [entities, sets] = await Promise.all([
		store.findEntities(entity, relation),
		store.findSubjectSets(entity, relation),
	]);
	const held = new Map<string, Subject>();
	for (const subject of [...entities, ...sets]) {
		held.set(keyOf(subject), subject);
	}

	const add = [...wanted].filter(([key]) => !held.has(key)).map(([, t]) => t);
	const remove = [...held]
		.filter(([key]) => !wanted.has(key))
		.map(([, subject]) => ({ object: entity, relation, subject }));
	if (add.length > 0 || remove.length > 0) await store.write({ remove, add });
	return { added: add.length, removed: remove.length };
}
