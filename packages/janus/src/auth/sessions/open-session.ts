/**
 * Opening a session once a user proved who they are, and the session as
 * application code sees it.
 */

import { mintId } from '../../ids/id';
import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser } from '../context';
import { type DeviceHint, deviceOutcome } from '../devices';
import type { SessionRecord, UserRecord } from '../port/types';
import { hashSecret, mintSecret } from '../secrets';
import type { Session, SignedIn } from '../types';

/** A session as application code sees it: everything but the token's hash. */
export function toSession(record: SessionRecord): Session {
	const { tokenHash: _, ...session } = record;
	return session;
}

/**
 * Opens a session for a user who just proved who they are. The token is in
 * the answer and nowhere else: the store holds its hash.
 *
 * `device` is what the sign-in was told of the device, and the answer says
 * whether it is new to the user; `signUp` mints a first token and is never
 * new. Reporting a new device is the caller's, once its sign-in is complete
 * (`reportNewDevice`).
 */
export async function openSession(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	device: DeviceHint,
	signUp = false,
): Promise<SignedIn<AnyUser>> {
	const now = context.clock.now();
	const token = mintSecret();
	const record: SessionRecord = {
		id: mintId(now.getTime()),
		tokenHash: hashSecret(token),
		userId: user.id,
		authenticatedAt: now,
		expiresAt: new Date(now.getTime() + type.lifespanMs),
		revokedAt: null,
		createdAt: now,
	};

	await context.store.sessions.insertSession(record);
	return {
		status: 'signedIn',
		user: toUser(user),
		session: toSession(record),
		token,
		...deviceOutcome(context, user.id, device, signUp),
	};
}
