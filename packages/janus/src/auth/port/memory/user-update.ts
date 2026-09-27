import { NotFoundError, StoreConflict } from '../../../errors/janus-error';
import type { Id } from '../../../ids/id';
import type { UserPatch, UserRecord } from '../types';
import { copy } from './copy';
import {
	dropLogins,
	indexLogins,
	taken,
	takenBy,
	type UserIndex,
} from './user-index';

/**
 * `updateUser` in memory: refused for an unknown id, a version that moved or
 * a login held by another user — checked, then written, in one synchronous
 * step.
 */
export function updateStored(
	index: UserIndex,
	id: Id,
	patch: UserPatch,
	ifVersion: number,
): UserRecord {
	const stored = index.byId.get(id);

	if (stored === undefined) {
		throw new NotFoundError('updateUser: no user has this id', {
			userId: id,
			operation: 'updateUser',
		});
	}

	if (stored.version !== ifVersion) {
		throw new StoreConflict(
			'version',
			`updateUser: expected version ${ifVersion}, found ${stored.version}`,
			{
				userId: id,
				expectedVersion: ifVersion,
				actualVersion: stored.version,
				operation: 'updateUser',
			},
		);
	}

	if (patch.logins !== undefined) {
		const collision = takenBy(index, stored.type, patch.logins, id);
		if (collision !== undefined) {
			throw taken('updateUser', stored.type, collision);
		}
	}

	const written = applyPatch(stored, copy(patch));

	index.byId.set(id, written);
	if (patch.logins !== undefined) {
		dropLogins(index, stored);
		indexLogins(index, written);
	}

	return copy(written);
}

/**
 * The record a patch produces: the fields it names, replaced whole; the fields
 * it does not name, untouched.
 *
 * Reads each field by name rather than spreading the patch, so a key the port
 * does not declare — `version`, `id`, `type`, `createdAt`, or a `snake_case`
 * typo from JavaScript — never reaches the record. A key present as
 * `undefined` is absent, never an erasure.
 */
function applyPatch(stored: UserRecord, patch: UserPatch): UserRecord {
	return {
		...stored,
		schemaVersion: patch.schemaVersion ?? stored.schemaVersion,
		active: patch.active ?? stored.active,
		fields: patch.fields ?? stored.fields,
		logins: patch.logins ?? stored.logins,
		password: patch.password === undefined ? stored.password : patch.password,
		secondFactor:
			patch.secondFactor === undefined
				? stored.secondFactor
				: patch.secondFactor,
		emailVerifiedAt:
			patch.emailVerifiedAt === undefined
				? stored.emailVerifiedAt
				: patch.emailVerifiedAt,
		version: stored.version + 1,
		updatedAt: patch.updatedAt,
	};
}
