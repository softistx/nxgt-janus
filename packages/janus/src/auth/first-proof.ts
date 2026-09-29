/**
 * The first proof of an e-mail by a sign-in code or a sign-in link: the
 * address reached an inbox no one had proved before, so whatever was set on
 * the account before that proof is not the inbox holder's to keep.
 *
 * Anybody can sign up with somebody else's e-mail and a password of their
 * own — and enrol a second factor on their own phone. Without this, the real
 * holder signing in by e-mail later would verify the address and leave that
 * password, that factor and their sessions working: locked out by a factor
 * they never set, or signed in beside someone who still holds the account.
 * So the write that proves the address also drops the password and the
 * second factor with its recovery codes, and every session is revoked before
 * the new one opens: the same ending as `resetPassword.confirm`, which
 * proves the address too, plus the factor it keeps.
 */

import type { Id } from '../ids/id';
import type { ResolvedType } from './config';
import { type Context, writeUser } from './context';
import { emit } from './events';
import { endWhatThePasswordOpened } from './password-written';
import type { UserRecord } from './port/types';
import { isActive } from './second-factor/factor';

/**
 * Proves `user`'s e-mail, never proved before, under the version read — an
 * address changed since is not the one proved: a `VERSION_CONFLICT` then.
 * Drops the password and the second factor — active or waiting, and its
 * recovery codes with it — in the same write, and revokes every session and
 * spends what the password opened — reset links and second-factor
 * challenges — **both before the write and after it**.
 *
 * Before, so an outage there leaves the e-mail unproved and the owner's next
 * code or link runs this again; after, so a sign-in landing in between is
 * ended too. An outage after the write is the one that leaves a session live.
 *
 * `user.emailVerified` is sent, then `user.passwordChanged` when a password
 * was dropped and `user.secondFactorDisabled` when an active factor was —
 * the rule of `secondFactor.disable` — from a `finally`, so an outage ending
 * the sessions still reports the write, which a retry would not make again.
 */
export async function proveFirstEmail(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
	where: string,
): Promise<UserRecord> {
	await endWhatTheSquatterOpened(context, user.id);
	let dropped = false;
	let disabled = false;
	const proved = await writeUser(
		context,
		user.id,
		type,
		{ ifVersion: user.version },
		where,
		(record, now) => {
			dropped = record.password !== null;
			disabled = isActive(record.secondFactor);
			return {
				emailVerifiedAt: now,
				...(dropped ? { password: null } : {}),
				...(record.secondFactor === null ? {} : { secondFactor: null }),
			};
		},
	);
	try {
		// Whoever signed up with this address and not its inbox is signed
		// out, and a sign-in they left waiting on its second factor cannot
		// be finished — before the new session opens.
		await endWhatTheSquatterOpened(context, proved.id);
	} finally {
		await emit(context, 'user.emailVerified', proved, proved.updatedAt);
		if (dropped) {
			await emit(context, 'user.passwordChanged', proved, proved.updatedAt);
		}
		if (disabled) {
			await emit(
				context,
				'user.secondFactorDisabled',
				proved,
				proved.updatedAt,
			);
		}
	}
	return proved;
}

/** Every session of the user revoked, and what their password opened spent. */
async function endWhatTheSquatterOpened(
	context: Context,
	userId: Id,
): Promise<void> {
	await context.store.sessions.revokeUserSessions(userId, context.clock.now());
	await endWhatThePasswordOpened(context, userId);
}
