import { isId } from '../../ids/id';
import type { ResolvedType } from '../config';
import { type Context, idOf } from '../context';
import { emit } from '../events';
import type { UserRef } from '../types';

/**
 * Deletes the user, then every session, token and tuple naming them. `true`
 * when this call deleted them; a replay finds nobody, answers `false`, and
 * still deletes what was left.
 */
export async function deleteUser(
	context: Context,
	type: ResolvedType,
	user: UserRef,
): Promise<boolean> {
	const { store, clock } = context;
	const id = idOf(user);
	if (!isId(id)) return false;

	// Read first, so a staff API never deletes a patient: another type's
	// id is answered as nobody, and nothing of theirs is touched.
	const record = await store.users.findUser(id);
	if (record !== null && record.type !== type.name) return false;

	// The user first: from then on nobody can sign in as them, and what
	// is left — sessions, tokens — is refused for a user who is gone. An
	// outage between the steps leaves only that inert remainder, and a
	// replay, finding no user, still deletes it.
	const deletedAt = clock.now();
	const deleted = record !== null && (await store.users.deleteUser(id));
	try {
		await store.sessions.deleteUserSessions(id);
		await store.tokens.deleteUserTokens(id);
		// Last, and on a replay too: the tuples naming them.
		await context.relations?.deleteEntity({ type: type.name, id });
	} finally {
		// Once, when this call deleted them — even when an outage
		// interrupts the steps above: a replay deletes nobody, so it
		// could not send it.
		if (deleted) {
			await emit(context, 'user.deleted', { id, type: type.name }, deletedAt);
		}
	}
	return deleted;
}
