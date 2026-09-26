import { NotFoundError } from '../errors/janus-error';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	checkPassword,
	emailOf,
	findRecord,
	getRecord,
	holderOfEmail,
	idOf,
	passwordRule,
	requireHasher,
	toUser,
	writeUser,
} from './context';
import { emit } from './events';
import {
	issueOneTime,
	refuseStale,
	spendOneTime,
	unknownOneTime,
} from './one-time';
import { endSignInsWaiting } from './password-written';
import type { TokenKind, TokenRecord, UserRecord } from './port/types';
import type { IssuedToken, ResetPasswordApi, VerifyEmailApi } from './types';

/**
 * The e-mail flows: send a one-time token by e-mail, then confirm it —
 * verifying the address, or resetting the password. Both confirm the same
 * way: spend the token, read the user, and check the address again on the
 * very record the write replaces.
 */
export function emailFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
): VerifyEmailApi<AnyUser> & ResetPasswordApi<AnyUser> {
	const { store, clock } = context;

	/**
	 * Spends a token and says why it cannot be used, when it cannot. A user
	 * gone since, or of another type, is as good as no token; a token sent to
	 * an e-mail the user no longer has is stale.
	 */
	const redeem = async (
		kind: TokenKind,
		secret: string,
		where: string,
	): Promise<{ token: TokenRecord; user: UserRecord }> => {
		const token = await spendOneTime(context, secret, kind, where, 'token');
		const user = await findRecord(context, token.userId, type.name);
		if (user === null) throw unknownOneTime(where, 'token');

		refuseStale(type, user, token, where, 'token');
		return { token, user };
	};

	/** Issues a one-time token for the user's current e-mail. */
	const issue = async (
		kind: 'verifyEmail' | 'resetPassword',
		user: UserRecord,
		where: string,
	): Promise<IssuedToken> => {
		const email = emailOf(type, user.fields);
		if (email === null) {
			throw new NotFoundError(`${where}: the user has no e-mail`, {
				userId: user.id,
				userType: type.name,
				operation: where,
			});
		}

		const { secret, expiresAt } = await issueOneTime(context, {
			kind,
			userId: user.id,
			address: email,
			ttlMs: context.config.tokenTtlMs[kind],
		});
		return { token: secret, email, expiresAt };
	};

	return {
		verifyEmail: {
			async send(user) {
				const where = at('verifyEmail.send');
				const record = await getRecord(context, idOf(user), type.name, where);
				return issue('verifyEmail', record, where);
			},

			async confirm(secret) {
				const where = at('verifyEmail.confirm');
				const { token, user } = await redeem('verifyEmail', secret, where);
				let newlyVerified = false;
				const written = await writeUser(
					context,
					user.id,
					type,
					undefined,
					where,
					(record, now) => {
						// Checked again on the record written: an e-mail changed
						// since the read above is not the one the link proved.
						refuseStale(type, record, token, where, 'token');
						newlyVerified = record.emailVerifiedAt === null;
						return { emailVerifiedAt: now };
					},
				);
				if (newlyVerified) {
					await emit(context, 'user.emailVerified', written, written.updatedAt);
				}
				return toUser(written);
			},
		},

		resetPassword: {
			async request(email) {
				const where = at('resetPassword.request');
				passwordRule(type, where);
				const record = await holderOfEmail(context, type, String(email));
				if (record === null) return null;

				const issued = await issue('resetPassword', record, where);
				return { ...issued, user: toUser(record) };
			},

			async confirm(secret, password) {
				const where = at('resetPassword.confirm');
				passwordRule(type, where);
				// Checked before the token is spent: a password refused for its
				// length must not cost the visitor their link.
				checkPassword(type, password, where);
				const hash = await requireHasher(context, where).hash(password);

				const { token, user } = await redeem('resetPassword', secret, where);
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
							...(record.emailVerifiedAt === null
								? { emailVerifiedAt: now }
								: {}),
						};
					},
				);
				// Reported before the steps an outage can interrupt: the link is
				// spent, so a retry is refused and could not send them.
				await emit(context, 'user.passwordReset', written, written.updatedAt);
				if (newlyVerified) {
					await emit(context, 'user.emailVerified', written, written.updatedAt);
				}

				// Whoever had the old password is signed out, and a sign-in they
				// left waiting on its second factor cannot be finished.
				await store.sessions.revokeUserSessions(written.id, clock.now());
				await endSignInsWaiting(context, written.id);
				return toUser(written);
			},
		},
	};
}
