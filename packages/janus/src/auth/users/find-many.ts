/**
 * `findMany`: several users of one type by id, in one query when the users
 * store implements the optional `findUsers`, and with `findUser`, a few ids at
 * a time, when it does not.
 */

import { StoreFailure } from '../../errors/janus-error';
import { isId } from '../../ids/id';
import type { Context } from '../context';
import type { UserRecord } from '../port/types';

/**
 * The most ids one `findUsers` call is given. A longer list is read in
 * several calls, one after another, so no query grows with the caller's list.
 */
export const FIND_MANY_BATCH = 100;

/**
 * How many `findUser` calls run at once when the store has no `findUsers`:
 * enough to keep a 100-row list quick, few enough to leave the connection
 * pool to the rest of the application.
 */
export const FIND_MANY_CONCURRENCY = 10;

/**
 * The users of this type holding these ids, **in the order the ids were
 * given**, each once — at its first occurrence. An id that is malformed, held
 * by nobody or held by a user of another type is left out: an absence is a
 * shorter list, never a rejection. A failure throws.
 *
 * An empty list — or one with no well-formed id — answers `[]` without
 * reaching the store.
 */
export async function findManyRecords(
	context: Context,
	ids: readonly string[],
	type: string,
	where: string,
): Promise<UserRecord[]> {
	if (!Array.isArray(ids)) {
		throw new TypeError(`${where}: ids must be an array of user ids`);
	}

	const wanted = [
		...new Set(ids.filter((id) => typeof id === 'string' && isId(id))),
	];
	const found = new Map<string, UserRecord>();

	for (let start = 0; start < wanted.length; start += FIND_MANY_BATCH) {
		const batch = wanted.slice(start, start + FIND_MANY_BATCH);
		for (const record of await readBatch(context, batch)) {
			if (record.type === type) found.set(record.id, record);
		}
	}

	// Read back through the ids asked for, so a record the store answered
	// for an id nobody asked about never reaches the caller.
	return wanted.flatMap((id) => {
		const record = found.get(id);
		return record === undefined ? [] : [record];
	});
}

/** One batch: one `findUsers` call, or bounded `findUser` calls. */
async function readBatch(
	context: Context,
	ids: readonly string[],
): Promise<readonly UserRecord[]> {
	const { users } = context.store;

	if (context.capabilities.findUsers && users.findUsers !== undefined) {
		const answer: unknown = await users.findUsers(ids);
		if (!Array.isArray(answer)) {
			throw new StoreFailure(
				'users.findUsers answered no list: an absence is a shorter list, so this store forgot to answer',
				{ slot: 'users', operation: 'findUsers' },
			);
		}
		return answer as readonly UserRecord[];
	}

	const records: UserRecord[] = [];
	for (let start = 0; start < ids.length; start += FIND_MANY_CONCURRENCY) {
		const answers = await Promise.all(
			ids
				.slice(start, start + FIND_MANY_CONCURRENCY)
				.map((id) => users.findUser(id)),
		);
		for (const record of answers) if (record !== null) records.push(record);
	}
	return records;
}
