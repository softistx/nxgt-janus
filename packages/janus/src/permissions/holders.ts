/**
 * `holders()`: the single entities holding a relation on an object, by pages,
 * optionally filtered — the reverse of `grant`, read from `findHolders` when
 * the store has it and from `findEntities` otherwise.
 */

import type { CursorPage } from '../pagination/cursor-page';
import {
	invalidCursor,
	MAX_PAGE_SIZE,
	pageLimit,
} from '../pagination/cursor-page';
import { isStorable } from '../stores/storable';
import type { Entity } from '../subjects/subject';
import { targetOf } from './input';
import type { HoldersPage } from './model/grant';
import { holderCursor, pageOfHolders } from './port/holders';
import type { RelationStore } from './port/types';
import type { ResolvedModel } from './resolve/resolved';

export async function holders(
	model: ResolvedModel,
	store: RelationStore,
	object: unknown,
	relation: string,
	options?: HoldersPage,
): Promise<CursorPage<Entity>> {
	const where = 'holders';
	const limit = pageLimit(options?.first, where);
	const after = options?.after ?? null;
	if (after !== null && typeof after !== 'string') {
		throw new TypeError(
			`${where}: after must be the nextCursor of a page, or null`,
		);
	}
	const text = options?.search;
	if (text !== undefined && typeof text !== 'string') {
		throw new TypeError(`${where}: search must be a string, or absent`);
	}
	const matches = options?.matches;
	if (matches !== undefined && typeof matches !== 'function') {
		throw new TypeError(`${where}: matches must be a function, or absent`);
	}
	const { entity } = targetOf(model, object, relation, where);
	const search = text === undefined || text === '' ? null : text;
	// No stored id holds a NUL or a lone surrogate: nothing can match, and a
	// database must not be asked (it would answer with an error, not a page).
	if (search !== null && !isStorable(search)) {
		return { items: [], nextCursor: null };
	}
	if (after !== null && !isStorable(after)) throw invalidCursor(where, after);

	const read = async (
		cursor: string | null,
		size: number,
	): Promise<CursorPage<Entity>> => {
		if (store.findHolders !== undefined) {
			return store.findHolders({
				object: entity,
				relation,
				after: cursor,
				limit: size,
				search,
			});
		}
		const all = await store.findEntities(entity, relation);
		return pageOfHolders(all, { after: cursor, limit: size, search }, where);
	};

	if (matches === undefined) return read(after, limit);

	// A predicate the store cannot see: read in the largest pages and keep
	// what passes, until one more than the page is known.
	const kept: Entity[] = [];
	let cursor = after;
	for (;;) {
		const page = await read(cursor, MAX_PAGE_SIZE);
		for (const holder of page.items) {
			if (await matches(holder)) kept.push(holder);
			if (kept.length > limit) break;
		}
		if (kept.length > limit) {
			const items = kept.slice(0, limit);
			return { items, nextCursor: holderCursor(items[limit - 1] as Entity) };
		}
		if (page.nextCursor === null) return { items: kept, nextCursor: null };
		cursor = page.nextCursor;
	}
}
