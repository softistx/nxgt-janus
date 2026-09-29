/**
 * The first proof of an e-mail by a sign-in code or a sign-in link: the
 * address reached an inbox no one had proved before, so whatever was set on
 * the account before that proof is not the inbox holder's to keep.
 *
 * Anybody can sign up with somebody else's e-mail and a password of their
 * own. Without this, the real holder signing in by e-mail later would verify
 * the address and leave that password — and its sessions — working. So the
 * write that proves the address also drops the password, and every session
 * is revoked before the new one opens: the same ending as
 * `resetPassword.confirm`, which proves the address too.
 */

import type { ResolvedType } from './config';
import { type Context, writeUser } from './context';
import { emit } from './events';
import { endWhatThePasswordOpened } from './password-written';
import type { UserRecord } from './port/types';

/**
 * Proves `user`'s e-mail, never proved before, under the version read — an
 * address changed since is not the one proved: a `VERSION_CONFLICT` then.
 * Drops the password in the same write, then revokes every session and
 * spends what the password opened: reset links and second-factor
 * challenges.
 *
 * `user.emailVerified` is sent, and `user.passwordChanged` when a password
 * was dropped — from a `finally`, so an outage ending the sessions still
 * reports the write, which a retry would not make again.
 */
export async function proveFirstEmail(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	where: string,
): Promise<UserRecord> {
	let dropped = false;
	const proved = await writeUser(
		context,
		user.id,
		type,
		{ ifVersion: user.version },
		where,
		(record, now) => {
			dropped = record.password !== null;
			return {
				emailVerifiedAt: now,
				...(dropped ? { password: null } : {}),
			};
		},
	);
	try {
		// Whoever signed up with this address and not its inbox is signed
		// out, and a sign-in they left waiting on its second factor cannot
		// be finished — before the new session opens.
		await context.store.sessions.revokeUserSessions(
			proved.id,
			context.clock.now(),
		);
		await endWhatThePasswordOpened(context, proved.id);
	} finally {
		await emit(context, 'user.emailVerified', proved, proved.updatedAt);
		if (dropped) {
			await emit(context, 'user.passwordChanged', proved, proved.updatedAt);
		}
	}
	return proved;
}
