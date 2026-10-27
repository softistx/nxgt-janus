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

/** Holders one `holders()` call looks at with a predicate, unless `scanLimit` says otherwise. */
const DEFAULT_SCAN_LIMIT = 500;

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
	const matchesMany = options?.matchesMany;
	if (matchesMany !== undefined && typeof matchesMany !== 'function') {
		throw new TypeError(`${where}: matchesMany must be a function, or absent`);
	}
	if (matches !== undefined && matchesMany !== undefined) {
		throw new TypeError(
			`${where}: matches and matchesMany are exclusive, pass one`,
		);
	}
	const scanLimit = options?.scanLimit ?? DEFAULT_SCAN_LIMIT;
	if (
		scanLimit !== Number.POSITIVE_INFINITY &&
		(!Number.isSafeInteger(scanLimit) || scanLimit < 1)
	) {
		throw new TypeError(
			`${where}: scanLimit must be a positive integer, or Infinity`,
		);
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

	if (matches === undefined && matchesMany === undefined) {
		return read(after, limit);
	}

	const judge = async (
		batch: readonly Entity[],
	): Promise<readonly boolean[]> => {
		if (matchesMany === undefined) {
			const answers: boolean[] = [];
			for (const holder of batch) {
				answers.push(
					Boolean(await (matches as NonNullable<typeof matches>)(holder)),
				);
			}
			return answers;
		}
		const answers = await matchesMany(batch);
		if (!Array.isArray(answers) || answers.length !== batch.length) {
			throw new TypeError(
				`${where}: matchesMany must answer one boolean per holder, in order`,
			);
		}
		return answers;
	};

	// A predicate the store cannot see: read in the largest pages and keep
	// what passes, until one more than the page is known or the scan budget is
	// spent (the holders kept so far, and a cursor after the last one looked at).
	const kept: Entity[] = [];
	let cursor = after;
	let scanned = 0;
	for (;;) {
		const page = await read(cursor, MAX_PAGE_SIZE);
		const room = Math.max(scanLimit - scanned, 0);
		const batch = page.items.slice(0, room);
		const answers = await judge(batch);
		scanned += batch.length;
		for (const [i, holder] of batch.entries()) {
			if (answers[i]) kept.push(holder);
			if (kept.length > limit) {
				const items = kept.slice(0, limit);
				return { items, nextCursor: holderCursor(items[limit - 1] as Entity) };
			}
		}
		if (batch.length < page.items.length) {
			return {
				items: kept,
				nextCursor: holderCursor(batch[batch.length - 1] as Entity),
			};
		}
		if (page.nextCursor === null) return { items: kept, nextCursor: null };
		if (scanned >= scanLimit) {
			return { items: kept, nextCursor: page.nextCursor };
		}
		cursor = page.nextCursor;
	}
}
