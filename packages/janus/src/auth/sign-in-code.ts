import type { At } from './at';
import type { ResolvedType } from './config';
import { type AnyUser, type Context, findRecord, toUser } from './context';
import { deviceHint } from './devices';
import {
	type Finish,
	finishEmailSignIn,
	keepOnlyLatest,
	signInHolder,
} from './email-sign-in';
import { countMailByAddress } from './mail-requests';
import {
	burnOneTime,
	CODE_ATTEMPTS,
	codeInvalid,
	codeMatches,
	countCodeAttempt,
	issueCode,
	spendOneTime,
	unknownChallenge,
} from './one-time';
import { sendOnce } from './prepared';
import { mintSecret } from './secrets';
import type {
	IssuedCode,
	PreparedCode,
	SignInCodeApi,
	SignInOptions,
	SignInResult,
} from './types';

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
 * each request cancels the code before — so `request` is counted per
 * address (`mail-requests.ts`), and the application rate-limits it per
 * client. The code's hash is keyed by the challenge, so the
 * tokens alone do not reveal it.
 *
 * `request` is `prepare`, then `send` (`prepared.ts`): counted, the
 * challenge minted — before anybody is looked up, so the visitor gets one
 * whoever holds the address — then looked up and issued under it.
 */
export function signInCodeFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): SignInCodeApi<AnyUser, SignInResult<AnyUser>>['signInCode'] {
	return {
		async request(email) {
			const where = at('signInCode.request');
			return (await prepareCode(context, type, String(email), where)).send();
		},

		async prepare(email) {
			const where = at('signInCode.prepare');
			return prepareCode(context, type, String(email), where);
		},

		async confirm(challenge, code, options) {
			return confirmCode(
				context,
				type,
				finish,
				{ challenge, code, options },
				at,
			);
		},
	};
}

/**
 * Counts a code asked for `email` — before it is looked up: past the limit,
 * nobody and somebody are refused alike — mints its challenge, and answers
 * the `send` that issues it, once.
 */
async function prepareCode(
	context: Context,
	type: ResolvedType,
	email: string,
	where: string,
): Promise<PreparedCode<AnyUser>> {
	await countMailByAddress(context, type, 'signInCode', email, where);
	const challenge = mintSecret();
	return Object.freeze({
		challenge,
		send: sendOnce(where, () =>
			issueSignInCode(context, type, email, challenge),
		),
	});
}

/** Issues a code under `challenge` for the holder of `email`, and spends every other they had. */
async function issueSignInCode(
	context: Context,
	type: ResolvedType,
	email: string,
	challenge: string,
): Promise<IssuedCode<AnyUser> | null> {
	// Nobody, and an inactive user, get the same answer: no code.
	const record = await signInHolder(context, type, email);
	if (record === null) return null;

	const address = String(record.fields[type.email]);
	const { secret, code, expiresAt } = await issueCode(context, {
		kind: 'signInCode',
		userId: record.id,
		address,
		ttlMs: context.config.tokenTtlMs.signInCode,
		secret: challenge,
	});
	// One live code per user: the ones sent before stop working.
	await keepOnlyLatest(context, record.id, 'signInCode', secret);
	return {
		code,
		challenge: secret,
		email: address,
		expiresAt,
		user: toUser(record),
	};
}

/** Redeems a challenge's code, proves the e-mail, and finishes the sign-in. */
async function confirmCode(
	context: Context,
	type: ResolvedType,
	finish: Finish,
	given: {
		readonly challenge: string;
		readonly code: string;
		readonly options: SignInOptions | undefined;
	},
	at: At,
): Promise<SignInResult<AnyUser>> {
	const where = at('signInCode.confirm');
	const device = deviceHint(context, given.options, where);
	const secret = String(given.challenge);
	const code = given.code;
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
	return finishEmailSignIn(context, type, finish, {
		user,
		token,
		where,
		noun: 'code',
		device,
	});
}
