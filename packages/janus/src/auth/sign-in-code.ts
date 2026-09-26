import { TokenError, UserInactiveError } from '../errors/janus-error';
import { isStorable } from '../stores/storable';
import { normalizeEmail, type ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	emailOf,
	findRecord,
	toUser,
	writeUser,
} from './context';
import {
	burnOneTime,
	CODE_ATTEMPTS,
	codeMatches,
	issueOneTime,
	refuseUnusable,
	spendOneTime,
	unknownOneTime,
} from './one-time';
import type { UserRecord } from './port/types';
import { hashSecret } from './secrets';
import type { SignInCodeApi, SignInResult } from './types';

/**
 * Signing in with a code sent to the user's e-mail: no password, and the
 * code proves the address.
 *
 * The code is six digits, so it is guessable where a link is not. What
 * bounds that is the same as for a second factor: the store counts every
 * attempt in one write, before the code is compared, and the fifth wrong one
 * spends the challenge. The code's hash is keyed by the challenge, so the
 * tokens alone do not reveal it.
 */
export function signInCodeFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
	finish: (record: UserRecord, where: string) => Promise<SignInResult<AnyUser>>,
): SignInCodeApi<AnyUser, SignInResult<AnyUser>>['signInCode'] {
	const { store, clock } = context;

	const codeInvalid = (where: string, userId: string, attemptsLeft: number) =>
		new TokenError('CODE_INVALID', `${where}: the code does not match`, {
			operation: where,
			userId,
			userType: type.name,
			attemptsLeft,
		});

	return {
		async request(email) {
			const wanted = normalizeEmail(String(email));
			const record = isStorable(wanted)
				? await store.users.findUserByLogin(type.name, wanted)
				: null;

			// Found by a login that is not their e-mail — a username that looks
			// like one — is nobody's e-mail; an inactive user gets no code.
			const held = record === null ? null : emailOf(type, record.fields);
			if (
				record === null ||
				held === null ||
				normalizeEmail(held) !== wanted ||
				!record.active
			) {
				return null;
			}

			const { secret, code, expiresAt } = await issueOneTime(context, {
				kind: 'signInCode',
				userId: record.id,
				address: held,
				ttlMs: context.config.tokenTtlMs.signInCode,
				code: true,
			});
			return {
				code: code as string,
				challenge: secret,
				email: held,
				expiresAt,
				user: toUser(record),
			};
		},

		async confirm(challenge, code) {
			const where = at('signInCode.confirm');
			const secret = String(challenge);

			// Counted before the code is compared, and in one write.
			const token = await store.tokens.countAttempt(
				hashSecret(secret),
				'signInCode',
			);
			refuseUnusable(token, clock.now(), where, 'challenge');
			const attemptsLeft = Math.max(0, CODE_ATTEMPTS - token.attempts);
			if (
				token.attempts > CODE_ATTEMPTS ||
				!codeMatches(token, secret, String(code))
			) {
				// The last attempt, and a wrong code: the challenge is spent.
				if (token.attempts === CODE_ATTEMPTS) {
					await burnOneTime(context, secret, 'signInCode');
				}
				throw codeInvalid(where, token.userId, attemptsLeft);
			}

			// A user gone since, or of another type, is as good as no challenge —
			// and another type's API leaves it unspent for its own.
			const user = await findRecord(context, token.userId, type.name);
			if (user === null) throw unknownOneTime(where, 'challenge');
			await spendOneTime(context, secret, 'signInCode', where, 'challenge');
			const email = emailOf(type, user.fields);
			if (
				email === null ||
				normalizeEmail(email) !== normalizeEmail(token.address)
			) {
				throw new TokenError(
					'TOKEN_STALE',
					`${where}: the code was sent to an e-mail the user no longer has`,
					{ operation: where, userId: user.id, userType: type.name },
				);
			}
			if (!user.active) {
				throw new UserInactiveError(`${where}: the user is inactive`, {
					userId: user.id,
					userType: type.name,
				});
			}

			// The code reached the inbox: that proves the e-mail.
			const proved =
				user.emailVerifiedAt === null
					? await writeUser(
							context,
							user.id,
							type,
							undefined,
							where,
							(_, now) => ({
								emailVerifiedAt: now,
							}),
						)
					: user;
			return finish(proved, where);
		},
	};
}
