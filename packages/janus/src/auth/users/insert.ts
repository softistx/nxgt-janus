import { mintId } from '../../ids/id';
import type { ResolvedType } from '../config';
import {
	type Context,
	checkPassword,
	loginsOf,
	requireHasher,
	validateFields,
} from '../context';
import { emit } from '../events';
import type { UserRecord } from '../port/types';
import type { Input } from './any-type-api';

/** Validates, hashes, writes once. What `create` and `signUp` share. */
export async function insert(
	context: Context,
	type: ResolvedType,
	input: Input,
	where: string,
): Promise<UserRecord> {
	const { store, clock } = context;
	const { password, active, ...rest } = input ?? {};
	const now = clock.now();
	const fields = await validateFields(type, rest, where);

	let hash: UserRecord['password'] = null;
	if (password !== undefined) {
		checkPassword(type, password as string, where);
		hash = {
			hash: await requireHasher(context, where).hash(password as string),
			updatedAt: now,
		};
	}

	const inserted = await store.users.insertUser({
		id: mintId(now.getTime()),
		type: type.name,
		schemaVersion: type.schemaVersion,
		active: active === undefined ? true : active === true,
		fields,
		logins: loginsOf(type, fields, where),
		password: hash,
		secondFactor: null,
		emailVerifiedAt: null,
		version: 0,
		createdAt: now,
		updatedAt: now,
	});
	// Once the user exists: an outage opening signUp's session later still
	// leaves a user created, and reported.
	await emit(context, 'user.created', inserted, inserted.createdAt);
	return inserted;
}
