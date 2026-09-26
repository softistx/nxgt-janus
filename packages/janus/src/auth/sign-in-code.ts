import { UserInactiveError } from '../errors/janus-error';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	holderOfEmail,
	toUser,
	writeUser,
} from './context';
import {
	burnOneTime,
	CODE_ATTEMPTS,
	codeInvalid,
	codeMatches,
	countCodeAttempt,
	issueCode,
	refuseStale,
	spendOneTime,
	unknownChallenge,
} from './one-time';
import type { UserRecord } from './port/types';
import type { SignInCodeApi, SignInResult } from './types';

/**
 * Signing in with a code sent to the user's e-mail: no password, and the
 * code proves the address.
 *
 * The code is six digits, so it is guessable where a link is not. What
 * bounds that is the same as for a second factor: the store counts every
 * attempt in one write, before the code is compared, and the fifth wrong one
 * spends the challenge. **One code is live per user**: `request` spends the
 * ones sent before, so guesses never run against two challenges at once. Yet
 * anybody who knows an e-mail can ask for another, so the application still
 * rate-limits `request`. The code's hash is keyed by the challenge, so the
 * tokens alone do not reveal it.
 */
export function signInCodeFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
	finish: (record: UserRecord, where: string) => Promise<SignInResult<AnyUser>>,
): SignInCodeApi<AnyUser, SignInResult<AnyUser>>['signInCode'] {
	return {
		async request(email) {
			// Nobody, and an inactive user, get the same answer: no code.
			const record = await holderOfEmail(context, type, String(email));
			if (record === null || !record.active) return null;

			// One live code per user: the ones sent before stop working, so
			// guesses never run against more than one challenge at a time.
			await context.store.tokens.spendUserTokens(
				record.id,
				'signInCode',
				context.clock.now(),
			);
			const { secret, code, expiresAt } = await issueCode(context, {
				kind: 'signInCode',
				userId: record.id,
				address: String(record.fields[type.email]),
				ttlMs: context.config.tokenTtlMs.signInCode,
			});
			return {
				code,
				challenge: secret,
				email: String(record.fields[type.email]),
				expiresAt,
				user: toUser(record),
			};
		},

		async confirm(challenge, code) {
			const where = at('signInCode.confirm');
			const secret = String(challenge);
			const { token, attemptsLeft } = await countCodeAttempt(
				context,
				secret,
				'signInCode',
				where,
				type.name,
			);

			// A user gone since, or of another type, is as good as no challenge:
			// another type's API compares nothing — though the attempt, counted
			// before the type is known, is gone, and the last one spends it.
			const user = await findRecord(context, token.userId, type.name);
			if (user === null) {
				throw await unknownChallenge(context, token, secret, where);
			}

			if (!codeMatches(token, secret, String(code))) {
				// The last attempt, and a wrong code: the challenge is spent.
				if (token.attempts === CODE_ATTEMPTS) {
					await burnOneTime(context, secret, 'signInCode');
				}
				throw codeInvalid(where, user.id, type.name, attemptsLeft);
			}

			await spendOneTime(context, secret, 'signInCode', where, 'challenge');
			refuseStale(type, user, token, where, 'code');
			if (!user.active) {
				throw new UserInactiveError(`${where}: the user is inactive`, {
					userId: user.id,
					userType: type.name,
				});
			}

			// The code reached the inbox: that proves the e-mail — under the
			// version read, so an address changed since is not the one proved.
			const proved =
				user.emailVerifiedAt === null
					? await writeUser(
							context,
							user.id,
							type,
							{ ifVersion: user.version },
							where,
							(_, now) => ({ emailVerifiedAt: now }),
						)
					: user;
			return finish(proved, where);
		},
	};
}
