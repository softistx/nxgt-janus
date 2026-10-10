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
import { countMailByAddress } from '../mail-requests';
import { refuseStale } from '../one-time';
import { endWhatThePasswordOpened } from '../password-written';
import { sendOnce } from '../prepared';
import { hashSecret } from '../secrets';
import type { IssuedToken, PreparedRequest, ResetPasswordApi } from '../types';
import { issueEmailToken, redeemEmailToken } from './email-token';

type ResetPassword = ResetPasswordApi<AnyUser>['resetPassword'];
type IssuedReset = IssuedToken & { readonly user: AnyUser };

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
			return (await prepareReset(context, type, String(email), where)).send();
		},

		async prepare(email) {
			const where = at('resetPassword.prepare');
			return prepareReset(context, type, String(email), where);
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

/**
 * Counts a reset asked for `email` — before it is looked up: past the
 * limit, nobody and somebody are refused alike — and answers the `send`
 * that issues it, once. `request` is this, then `send`.
 */
async function prepareReset(
	context: Context,
	type: ResolvedType,
	email: string,
	where: string,
): Promise<PreparedRequest<IssuedReset>> {
	passwordRule(type, where);
	await countMailByAddress(context, type, 'resetPassword', email, where);
	return Object.freeze({
		send: sendOnce(where, () => issueReset(context, type, email, where)),
	});
}

/** Issues a reset token for the holder of `email`, and spends every other they had. */
async function issueReset(
	context: Context,
	type: ResolvedType,
	email: string,
	where: string,
): Promise<IssuedReset | null> {
	const record = await holderOfEmail(context, type, email);
	if (record === null) return null;

	const issued = await issueEmailToken(
		context,
		type,
		'resetPassword',
		record,
		where,
	);
	// One live link per user: the ones sent before stop working. Issued
	// first, spent after, as for a sign-in code, so requests that race
	// leave at most one live — never one each.
	await context.store.tokens.spendUserTokens(
		record.id,
		'resetPassword',
		context.clock.now(),
		hashSecret(issued.token),
	);
	return { ...issued, user: toUser(record) };
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
