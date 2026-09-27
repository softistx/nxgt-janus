/**
 * Resetting a password: send a token to the holder of an e-mail, then redeem
 * it to set the password — which proves the e-mail, and signs the user out
 * everywhere.
 */

import type { At } from '../at';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	holderOfEmail,
	passwordRule,
	requireHasher,
	toUser,
	writeUser,
} from '../context';
import { emit } from '../events';
import { refuseStale } from '../one-time';
import { endSignInsWaiting } from '../password-written';
import type { ResetPasswordApi } from '../types';
import { issueEmailToken, redeemEmailToken } from './email-token';

type ResetPassword = ResetPasswordApi<AnyUser>['resetPassword'];

/**
 * `resetPassword` of one user type: `request` a token for the holder of an
 * e-mail, then `confirm` it with a new password.
 */
export function resetPasswordFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): ResetPassword {
	return {
		async request(email) {
			const where = at('resetPassword.request');
			passwordRule(type, where);
			const record = await holderOfEmail(context, type, String(email));
			if (record === null) return null;

			const issued = await issueEmailToken(
				context,
				type,
				'resetPassword',
				record,
				where,
			);
			return { ...issued, user: toUser(record) };
		},

		async confirm(secret, password) {
			return confirmReset(
				context,
				type,
				secret,
				password,
				at('resetPassword.confirm'),
			);
		},
	};
}

/** Redeems a reset token: sets the password, proves the e-mail, signs out everywhere. */
async function confirmReset(
	context: Context,
	type: ResolvedType,
	secret: string,
	password: string,
	where: string,
): Promise<AnyUser> {
	passwordRule(type, where);
	// Checked before the token is spent: a password refused for its
	// length must not cost the visitor their link.
	checkPassword(type, password, where);
	const hash = await requireHasher(context, where).hash(password);

	const { token, user } = await redeemEmailToken(
		context,
		type,
		'resetPassword',
		secret,
		where,
	);
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
		// Whoever had the old password is signed out, and a sign-in
		// they left waiting on its second factor cannot be finished —
		// before the listener runs, however long it takes.
		await context.store.sessions.revokeUserSessions(
			written.id,
			context.clock.now(),
		);
		await endSignInsWaiting(context, written.id);
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
