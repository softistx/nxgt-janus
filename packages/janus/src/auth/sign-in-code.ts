import { UserInactiveError } from '../errors/janus-error';
import type { At } from './at';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	holderOfEmail,
	toUser,
	writeUser,
} from './context';
import { emit } from './events';
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
import { hashSecret } from './secrets';
import type { IssuedCode, SignInCodeApi, SignInResult } from './types';

/**
 * Signing in with a code sent to the user's e-mail: no password, and the
 * code proves the address.
 *
 * The code is six digits, so it is guessable where a link is not. What
 * bounds that is the same as for a second factor: the store counts every
 * attempt in one write, before the code is compared, and the fifth wrong one
 * spends the challenge. **At most one code is live per user**: `request`
 * spends every other once it issued its own, so concurrent requests cannot
 * each keep one. Yet anybody who knows an e-mail can ask for another — and
 * each request cancels the code before — so the application rate-limits
 * `request`, per address. The code's hash is keyed by the challenge, so the
 * tokens alone do not reveal it.
 */
export function signInCodeFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): SignInCodeApi<AnyUser, SignInResult<AnyUser>>['signInCode'] {
	return {
		async request(email) {
			return requestCode(context, type, String(email));
		},

		async confirm(challenge, code) {
			return confirmCode(context, type, finish, challenge, code, at);
		},
	};
}

type Finish = (
	record: UserRecord,
	where: string,
) => Promise<SignInResult<AnyUser>>;

/** Issues a code for the holder of `email`, and spends every other they had. */
async function requestCode(
	context: Context,
	type: ResolvedType,
	email: string,
): Promise<IssuedCode<AnyUser> | null> {
	// Nobody, and an inactive user, get the same answer: no code.
	const record = await holderOfEmail(context, type, email);
	if (record === null || !record.active) return null;

	const { secret, code, expiresAt } = await issueCode(context, {
		kind: 'signInCode',
		userId: record.id,
		address: String(record.fields[type.email]),
		ttlMs: context.config.tokenTtlMs.signInCode,
	});
	// One live code per user: the ones sent before stop working. Issued
	// first, spent after, so requests that race leave at most one live
	// — maybe none, and the visitor asks again — never one each.
	await context.store.tokens.spendUserTokens(
		record.id,
		'signInCode',
		context.clock.now(),
		hashSecret(secret),
	);
	return {
		code,
		challenge: secret,
		email: String(record.fields[type.email]),
		expiresAt,
		user: toUser(record),
	};
}

/** Redeems a challenge's code, proves the e-mail, and finishes the sign-in. */
async function confirmCode(
	context: Context,
	type: ResolvedType,
	finish: Finish,
	challenge: string,
	code: string,
	at: At,
): Promise<SignInResult<AnyUser>> {
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
	if (user.emailVerifiedAt !== null) return finish(user, where);
	const proved = await writeUser(
		context,
		user.id,
		type,
		{ ifVersion: user.version },
		where,
		(_, now) => ({ emailVerifiedAt: now }),
	);
	await emit(context, 'user.emailVerified', proved, proved.updatedAt);
	return finish(proved, where);
}
