/**
 * Redeeming a reset token: sets the password, proves the e-mail, signs the user
 * out everywhere — for one type's `confirm`, and for the root's, where the
 * user's type is only known once the token is spent.
 */

import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	passwordRule,
	requireHasher,
	toUser,
	writeUser,
} from '../context';
import { emit } from '../events';
import { refuseStale, unknownOneTime } from '../one-time';
import { endWhatThePasswordOpened } from '../password-written';
import { redeemEmailToken } from './email-token';

/**
 * The type whose password rule is the strictest among those that can reset
 * one — a password and an e-mail — or null when there is none. The first
 * declared wins a tie.
 */
function strictestType(context: Context): ResolvedType | null {
	let strictest: ResolvedType | null = null;
	let longest = 0;
	for (const type of context.config.types.values()) {
		if (type.password === null) continue;
		if (strictest === null || type.password.minLength > longest) {
			strictest = type;
			longest = type.password.minLength;
		}
	}
	return strictest;
}

/**
 * Redeems a reset token: sets the password, proves the e-mail, signs out
 * everywhere. `asked` is the type whose `confirm` was called, or null for the
 * root's: the password must then meet the strictest `minLength` of the types
 * that can reset one, before the token is spent, and the user's own type
 * answers after.
 */
export async function confirmReset(
	context: Context,
	asked: ResolvedType | null,
	secret: string,
	password: string,
	where: string,
): Promise<AnyUser> {
	// Checked before the token is spent: a password refused for its
	// length must not cost the visitor their link. At the root the type is
	// only known after the spend, so the strictest rule stands in for it.
	const gate = asked ?? strictestType(context);
	if (asked !== null) passwordRule(asked, where);
	if (gate !== null) checkPassword(gate, password, where);
	const hash = await requireHasher(context, where).hash(password);

	const { token, user, type } = await redeemEmailToken(
		context,
		asked,
		'resetPassword',
		secret,
		where,
	);
	// A type with no password has no reset: its users are as good as unknown.
	if (asked === null) {
		if (type.password === null) throw unknownOneTime(where, 'token');
		checkPassword(type, password, where);
	}
	let newlyVerified = false;
	const written = await writeUser(
		context,
		user.id,
		type,
		undefined,
		where,
		(record, now) => {
			// Checked again on the record written, as for verifyEmail.
			refuseStale(type, record, token, where, 'token');
			newlyVerified = record.emailVerifiedAt === null;
			return {
				password: { hash, updatedAt: now },
				// The link reached the inbox: that proves the e-mail.
				...(record.emailVerifiedAt === null ? { emailVerifiedAt: now } : {}),
			};
		},
	);
	try {
		// Whoever had the old password is signed out, a sign-in they
		// left waiting on its second factor cannot be finished, and no
		// other link replaces the password again — before the listener
		// runs, however long it takes.
		await context.store.sessions.revokeUserSessions(
			written.id,
			context.clock.now(),
		);
		await endWhatThePasswordOpened(context, written.id);
	} finally {
		// Reported even when an outage interrupts the steps above:
		// the link is spent, so a retry is refused and could not.
		await emit(context, 'user.passwordReset', written, written.updatedAt);
		if (newlyVerified) {
			await emit(context, 'user.emailVerified', written, written.updatedAt);
		}
	}
	return toUser(written);
}
