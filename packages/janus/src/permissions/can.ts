/**
 * `can()`: whether a subject holds a permission on an object — the walk of
 * `walk.ts`, after the refusals of what a caller passed.
 */

import { isStorable } from '../stores/storable';
import type { BoundModel } from './bound-model';
import { objectOf, subjectOf, typeOf } from './input';
import { Walk } from './walk';

/**
 * Whether `subject` holds `permission` on `object`: `false` for anonymous or
 * an id no store can keep, before any store call; a failure throws.
 */
export async function can(
	{ model, store, maxDepth }: BoundModel,
	subject: unknown,
	permission: string,
	object: unknown,
	options?: { readonly ctx?: unknown },
): Promise<boolean> {
	// Anonymous, before anything else — and before the store.
	if (subject === null || subject === undefined) return false;

	const root = objectOf(model, object, 'can');
	const type = typeOf(model, root.type, 'can');
	if (!type.relations.has(permission) && !type.permissions.has(permission)) {
		throw new TypeError(
			`can: "${permission}" is not a relation or a permission of ${type.name}`,
		);
	}

	const who = subjectOf(model, subject, 'can');
	// An id no store can keep is held by nobody, and no store is asked:
	// the same answer on every adapter, as for an anonymous subject.
	if (!isStorable(root.id) || !isStorable(who.id)) return false;

	return new Walk(
		model,
		store,
		maxDepth,
		options?.ctx,
		`${type.name}#${permission}`,
	).holds(
		who,
		{ entity: { type: root.type, id: root.id }, data: root.data },
		permission,
		0,
	);
}
