/**
 * What an adapter needs to page the holders of a relation: the request, the
 * cursor and the search, written once so every store orders and cuts the same
 * way. The reference store and the core's fallback use `pageOfHolders`.
 */

import type { CursorPage } from '../../pagination/cursor-page';
import { invalidCursor } from '../../pagination/cursor-page';
import type { Entity } from '../../subjects/subject';

/** Which holders a page lists: the single entities holding `relation` on `object`. */
export interface HolderPageRequest {
	readonly object: Entity;
	readonly relation: string;
	/**
	 * The `nextCursor` of the previous page, or `null` for the first. Minted by
	 * {@link holderCursor}; read by {@link readHolderCursor}, which refuses any
	 * other string.
	 */
	readonly after: string | null;
	/** Already bounded by the core, between 1 and `MAX_PAGE_SIZE`. */
	readonly limit: number;
	/**
	 * A text the holder's id contains, ignoring case, or `null` for no filter.
	 * Never empty, and a literal: `%`, `_` and `.` match themselves.
	 */
	readonly search: string | null;
}

/**
 * The cursor that follows `holder`: opaque, ordered by type then id. The
 * type's length comes first, so any id round-trips and nothing is parsed
 * with a `catch` (the scan holds this directory to none).
 */
export const holderCursor = (holder: Entity): string =>
	`${holder.type.length}:${holder.type}${holder.id}`;

/** The holder a cursor follows; throws `InvalidCursorError` for any other string. */
export function readHolderCursor(where: string, cursor: string): Entity {
	const head = /^(0|[1-9]\d{0,8}):/.exec(cursor);
	const length = head === null ? -1 : Number(head[1]);
	const start = head === null ? 0 : head[0].length;
	if (length < 0 || start + length > cursor.length) {
		throw invalidCursor(where, cursor);
	}
	return {
		type: cursor.slice(start, start + length),
		id: cursor.slice(start + length),
	};
}

/** Whether `id` contains `search`, ignoring case. */
export const idMatches = (id: string, search: string): boolean =>
	id.toLowerCase().includes(search.toLowerCase());

const compare = (a: Entity, b: Entity): number => {
	if (a.type !== b.type) return a.type < b.type ? -1 : 1;
	if (a.id !== b.id) return a.id < b.id ? -1 : 1;
	return 0;
};

/** `holders` ordered by type then id, cut after the cursor and by the search, one page. */
export function pageOfHolders(
	holders: readonly Entity[],
	{
		after,
		limit,
		search,
	}: Pick<HolderPageRequest, 'after' | 'limit' | 'search'>,
	where = 'findHolders',
): CursorPage<Entity> {
	const from = after === null ? null : readHolderCursor(where, after);
	const rest = holders
		.filter(
			(holder) =>
				(from === null || compare(holder, from) > 0) &&
				(search === null || idMatches(holder.id, search)),
		)
		.sort(compare);
	const items = rest
		.slice(0, limit)
		.map((holder): Entity => ({ type: holder.type, id: holder.id }));
	const last = items.at(-1);
	return {
		items,
		nextCursor:
			rest.length > limit && last !== undefined ? holderCursor(last) : null,
	};
}
