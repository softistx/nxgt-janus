/** Reading what a caller passed to `can()`, `list()`, `grant()` and `revoke()`. */

import type { Subject } from '../subjects/subject';
import type { Holder, ResolvedModel, ResolvedObjectType } from './resolve';

/** What no part of an id may hold: the notation would read it two ways. */
const RESERVED = /[@#()]/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

export function idOf(value: unknown, what: string, where: string): string {
	if (typeof value !== 'string' || value === '' || RESERVED.test(value)) {
		throw new TypeError(
			`${where}: ${what} must be a non-empty string without @, # or parentheses`,
		);
	}
	return value;
}

export function typeOf(
	model: ResolvedModel,
	name: string,
	where: string,
): ResolvedObjectType {
	const type = model.types.get(name);
	if (type === undefined) {
		throw new TypeError(
			`${where}: "${name}" is not an object type of the model`,
		);
	}
	return type;
}

export function objectOf(
	model: ResolvedModel,
	value: unknown,
	where: string,
): {
	readonly type: string;
	readonly id: string;
	readonly data: Readonly<Record<string, unknown>>;
} {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new TypeError(
			`${where}: the object must be { type, id, …its fields }`,
		);
	}
	typeOf(model, value.type, where);
	return {
		type: value.type,
		id: idOf(value.id, 'the object id', where),
		data: value,
	};
}

/**
 * The subject as the store compares it: `{ type, id }` for a user or an
 * object, and `{ type, id, relation }` for a subject set.
 *
 * Decided by the type, not the shape: a user's fields are flat on it, and one
 * named `relation` must not make a user read as a set. A user type is never a
 * set; an object type is one when `relation` is given.
 */
export function subjectOf(
	model: ResolvedModel,
	value: unknown,
	where: string,
): Subject {
	if (!isRecord(value) || typeof value.type !== 'string') {
		throw new TypeError(
			`${where}: the subject must be a user, or { type, id }`,
		);
	}
	const id = idOf(value.id, 'the subject id', where);
	if (model.subjects.has(value.type)) return { type: value.type, id };

	const type = typeOf(model, value.type, where);
	if (typeof value.relation !== 'string') return { type: type.name, id };
	if (!type.relations.has(value.relation)) {
		throw new TypeError(
			`${where}: "${value.relation}" is not a relation of ${type.name}, so ${type.name}:${id}#${value.relation} is no subject set`,
		);
	}
	return { type: type.name, id, relation: value.relation };
}

/** A tuple `grant` or `revoke` may write: a stored relation, and a holder it admits. */
export function tupleOf(
	model: ResolvedModel,
	object: unknown,
	relation: string,
	subject: unknown,
	where: string,
) {
	const target = objectOf(model, object, where);
	const type = typeOf(model, target.type, where);
	const def = type.relations.get(relation);
	if (def === undefined) {
		throw new TypeError(
			`${where}: "${relation}" is not a relation of ${type.name}`,
		);
	}
	if (def.kind === 'fromField') {
		throw new TypeError(
			`${where}: ${type.name}.${relation} is read from ${def.field}; there is nothing to store — change the ${type.name} instead`,
		);
	}

	const who = subjectOf(model, subject, where);
	if (!admits(def.holders, who)) {
		throw new TypeError(
			`${where}: ${type.name}.${relation} is not held by ${'relation' in who ? `${who.type}#${who.relation}` : who.type}`,
		);
	}

	return {
		object: { type: target.type, id: target.id },
		relation,
		subject: who,
	};
}

/**
 * Whether a stored relation admits `subject` as a holder: an entity of a
 * declared type, or a set of a declared `type#relation`. One rule for what
 * `grant()` writes and what `can()` and `list()` follow — a tuple the model
 * does not admit grants nothing, however it was stored.
 */
export function admits(holders: readonly Holder[], subject: Subject): boolean {
	return holders.some((holder) =>
		holder.kind === 'type'
			? !('relation' in subject) && holder.type === subject.type
			: 'relation' in subject &&
				holder.type === subject.type &&
				holder.relation === subject.relation,
	);
}
