/**
 * Reading a user's record by id — an absence is `null`, `getRecord` makes it
 * `NOT_FOUND` — and the one write that follows such a read, under a version.
 */

import { NotFoundError, StoreConflict } from '../../errors/janus-error';
import { isId } from '../../ids/id';
import type { ResolvedType } from '../config';
import { required } from '../outage';
import type { UserPatch, UserRecord } from '../port/types';
import type { UserRef, WriteOptions } from '../types';
import type { Context } from './create-context';
import { idOf } from './user';

const notFound = (where: string, id: string, type: string | null) =>
	new NotFoundError(
		`${where}: no ${type ?? 'user'} has this id`,
		type === null
			? { userId: id, operation: where }
			: { userId: id, userType: type, operation: where },
	);

/**
 * The user — of this type, when one is given — or `null`. A malformed id is an
 * absence decided without reaching the store: it arrives off a URL, and it is
 * "no such user", not a query and not an outage. A user of another type is
 * absent too: `auth.staff.find(patientId)` finds nobody.
 */
export async function findRecord(
	context: Context,
	id: string,
	type: string | null,
): Promise<UserRecord | null> {
	if (!isId(id)) return null;
	const record = await context.store.users.findUser(id);
	return record !== null && (type === null || record.type === type)
		? record
		: null;
}

/** The user, or `NOT_FOUND`. */
export async function getRecord(
	context: Context,
	id: string,
	type: string | null,
	where: string,
): Promise<UserRecord> {
	return required(await findRecord(context, id, type), () =>
		notFound(where, id, type),
	);
}

/**
 * One write that follows a read, under a version: the core reads the user,
 * checks `ifVersion` against what it read, computes the patch from the record,
 * and writes under the version it read. A user who changed in between is
 * `VERSION_CONFLICT`, and nothing is written.
 */
export async function writeUser(
	context: Context,
	user: UserRef,
	type: ResolvedType,
	options: WriteOptions | undefined,
	where: string,
	patchOf: (
		record: UserRecord,
		now: Date,
	) => Omit<UserPatch, 'updatedAt'> | Promise<Omit<UserPatch, 'updatedAt'>>,
): Promise<UserRecord> {
	const id = idOf(user);
	const record = await getRecord(context, id, type.name, where);
	const ifVersion = options?.ifVersion;

	if (ifVersion !== undefined && ifVersion !== record.version) {
		throw new StoreConflict(
			'version',
			`${where}: expected version ${ifVersion}, found ${record.version}`,
			{
				userId: id,
				expectedVersion: ifVersion,
				actualVersion: record.version,
				operation: where,
			},
		);
	}

	const now = context.clock.now();
	const patch = await patchOf(record, now);
	return context.store.users.updateUser(
		record.id,
		{ ...patch, updatedAt: now },
		record.version,
	);
}
