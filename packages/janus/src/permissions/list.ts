/**
 * `list()`: the ids of the objects of a type on which a subject holds a
 * permission, by pages — the walk run backwards, in `reverse.ts`.
 */

import type { CursorPage } from '../pagination/cursor-page';
import { pageLimit } from '../pagination/cursor-page';
import { isStorable } from '../stores/storable';
import type { BoundModel } from './bound-model';
import { subjectOf, typeOf } from './input';
import { Reverse } from './reverse';

/**
 * One page of the ids of the objects of `typeName` on which `subject` holds
 * `permission`, ascending; an empty page for anonymous, before any store call.
 */
export async function list(
	{ model, store, maxDepth }: BoundModel,
	subject: unknown,
	permission: string,
	typeName: unknown,
	options?: {
		readonly ctx?: unknown;
		readonly after?: string | null;
		readonly limit?: number;
	},
): Promise<CursorPage<string>> {
	const limit = pageLimit(options?.limit, 'list');
	const after = options?.after ?? null;
	if (after !== null && typeof after !== 'string') {
		throw new TypeError(
			'list: after must be the nextCursor of a page, or null',
		);
	}
	// Anonymous holds nothing, and the store is not asked.
	if (subject === null || subject === undefined) {
		return { items: [], nextCursor: null };
	}

	if (typeof typeName !== 'string') {
		throw new TypeError('list: the type must be an object type of the model');
	}
	const type = typeOf(model, typeName, 'list');
	if (!type.relations.has(permission) && !type.permissions.has(permission)) {
		throw new TypeError(
			`list: "${permission}" is not a relation or a permission of ${type.name}`,
		);
	}

	const who = subjectOf(model, subject, 'list');
	// A subject no store can keep holds nothing, and no store is asked.
	if (!isStorable(who.id)) return { items: [], nextCursor: null };

	const ids = await new Reverse(
		model,
		store,
		maxDepth,
		options?.ctx,
		who,
		`${type.name}#${permission}`,
	).objects(type.name, permission);

	return pageOf(ids, after, limit);
}

/** One page of `ids`, ascending, after the cursor. */
function pageOf(
	ids: Iterable<string>,
	after: string | null,
	limit: number,
): CursorPage<string> {
	const rest = [...ids].sort().filter((id) => after === null || id > after);
	const items = rest.slice(0, limit);
	const last = items.at(-1);
	return {
		items,
		nextCursor: rest.length > limit && last !== undefined ? last : null,
	};
}
