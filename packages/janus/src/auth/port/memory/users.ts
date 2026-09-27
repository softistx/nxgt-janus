import type { Id } from '../../../ids/id';
import type { UserRecord, UserStore } from '../types';
import { copy } from './copy';
import {
	dropLogins,
	indexLogins,
	keyOf,
	taken,
	takenBy,
	type UserIndex,
} from './user-index';
import { updateStored } from './user-update';

/** The user store in memory: the records by id, and the unique index on logins. */
export function memoryUserStore(): UserStore {
	const index: UserIndex = {
		byId: new Map<Id, UserRecord>(),
		byLogin: new Map<string, Id>(),
	};
	const { byId, byLogin } = index;

	return {
		async insertUser(record) {
			const stored = byId.get(record.id);
			if (stored !== undefined) return copy(stored);

			const collision = takenBy(index, record.type, record.logins, record.id);
			if (collision !== undefined) {
				throw taken('insertUser', record.type, collision);
			}

			const written = copy(record);
			byId.set(written.id, written);
			indexLogins(index, written);

			return copy(written);
		},

		async findUser(id) {
			const stored = byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async findUserByLogin(type, login) {
			const id = byLogin.get(keyOf(type, login));
			const stored = id === undefined ? undefined : byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async listUsers({ type, after, limit }) {
			// A Map keeps insertion order, not id order: a retried insert or an
			// id minted on another machine can land out of sequence.
			const ids = [...byId.values()]
				.filter((user) => user.type === type)
				.map((user) => user.id)
				.filter((id) => after === null || id > after)
				.sort();
			const pageIds = ids.slice(0, limit);
			const last = pageIds.at(-1);

			return {
				items: pageIds.map((id) => copy(byId.get(id) as UserRecord)),
				nextCursor: ids.length > limit && last !== undefined ? last : null,
			};
		},

		async updateUser(id, patch, ifVersion) {
			return updateStored(index, id, patch, ifVersion);
		},

		async deleteUser(id) {
			const stored = byId.get(id);
			if (stored === undefined) return false;

			byId.delete(id);
			dropLogins(index, stored);
			return true;
		},
	};
}
