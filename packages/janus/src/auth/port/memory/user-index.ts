import { StoreConflict } from '../../../errors/janus-error';
import type { Id } from '../../../ids/id';
import type { UserRecord } from '../types';

/** What the in-memory user store holds: the records, and the unique index on their logins. */
export interface UserIndex {
	readonly byId: Map<Id, UserRecord>;
	/** The unique index: (type, login) key → the id holding it. */
	readonly byLogin: Map<string, Id>;
}

/** The unique key of one login. `\u0000` cannot occur in a type name the core accepts. */
export const keyOf = (type: string, login: string): string =>
	`${type}\u0000${login}`;

/** The first of `logins` held by a user of `type` other than `id`. */
export const takenBy = (
	{ byLogin }: UserIndex,
	type: string,
	logins: readonly string[],
	id: Id,
): string | undefined =>
	logins.find((login) => {
		const holder = byLogin.get(keyOf(type, login));
		return holder !== undefined && holder !== id;
	});

/** The conflict a login held by another user of `type` is refused with. */
export const taken = (operation: string, type: string, login: string) =>
	new StoreConflict(
		'login',
		`${operation}: the login is taken by another ${type}`,
		{ login, userType: type, operation },
	);

/** Points every login of `record` at its id. */
export function indexLogins({ byLogin }: UserIndex, record: UserRecord): void {
	for (const login of record.logins) {
		byLogin.set(keyOf(record.type, login), record.id);
	}
}

/** Frees every login of `record`. */
export function dropLogins({ byLogin }: UserIndex, record: UserRecord): void {
	for (const login of record.logins) {
		byLogin.delete(keyOf(record.type, login));
	}
}
