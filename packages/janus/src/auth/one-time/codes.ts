/**
 * The six-digit code a challenge carries — a second factor's or an e-mailed
 * one: its attempts, counted before anything is compared, its hash, keyed by
 * the challenge, and the refusal of one that does not match.
 */

import { timingSafeEqual } from 'node:crypto';
import { TokenError } from '../../errors/janus-error';
import type { Context } from '../context';
import type { TokenKind, TokenRecord } from '../port/types';
import { hashSecret } from '../secrets';
import { refuseUnusable, unknownOneTime } from './refusals';
import { burnOneTime } from './spend';

/**
 * How many codes one challenge takes — a second factor's or an e-mail
 * code's. A six-digit code has a million values: five attempts is a
 * one-in-200,000 chance **per challenge**, and the attempts are counted by
 * the store in one write, never read then written.
 */
export const CODE_ATTEMPTS = 5;

/**
 * Counts one attempt at a challenge's code, before anything is compared: a
 * guess that fails for any reason has still cost one. Refuses a challenge
 * that cannot be used, and one past its last attempt — a call that raced the
 * one that spent it — unread.
 */
export async function countCodeAttempt(
	context: Context,
	secret: string,
	kind: TokenKind,
	where: string,
	userType: string,
): Promise<{ readonly token: TokenRecord; readonly attemptsLeft: number }> {
	const token = await context.store.tokens.countAttempt(
		hashSecret(secret),
		kind,
	);
	refuseUnusable(token, context.clock.now(), where, 'challenge');
	if (token.attempts > CODE_ATTEMPTS) {
		throw codeInvalid(where, token.userId, userType, 0);
	}
	return { token, attemptsLeft: CODE_ATTEMPTS - token.attempts };
}

/**
 * A code that does not match — a second factor's or an e-mailed one — or a
 * TOTP code already used. `attemptsLeft` only when a challenge counted it.
 */
export function codeInvalid(
	where: string,
	userId: string,
	userType: string,
	attemptsLeft?: number,
): TokenError {
	return new TokenError(
		'CODE_INVALID',
		`${where}: the code does not match, or was already used`,
		{
			operation: where,
			userId,
			userType,
			...(attemptsLeft === undefined ? {} : { attemptsLeft }),
		},
	);
}

/**
 * The refusal for a challenge whose user is gone, or of another type — the
 * API of the wrong type compares no code. Its attempt was counted all the
 * same, before the type was known, so the last one spends the challenge, as
 * a wrong code would: past it, every call answers `TOKEN_SPENT`.
 */
export async function unknownChallenge(
	context: Context,
	token: TokenRecord,
	secret: string,
	where: string,
): Promise<TokenError> {
	if (token.attempts === CODE_ATTEMPTS) {
		await burnOneTime(context, secret, token.kind);
	}
	return unknownOneTime(where, 'challenge');
}

/**
 * A code's hash, **keyed by its challenge**: the tokens alone — a dump, a
 * log of the table — do not reveal the code, since a million guesses at it
 * each need the challenge, which only the visitor holds.
 */
export const hashCode = (challenge: string, code: string): string =>
	hashSecret(`${challenge}${code}`);

/** Whether `code` is the one whose hash the token holds, compared in constant time. */
export function codeMatches(
	token: TokenRecord,
	challenge: string,
	code: string,
): boolean {
	if (token.codeHash === null || !/^\d{6}$/.test(code)) return false;
	const given = Buffer.from(hashCode(challenge, code));
	const held = Buffer.from(token.codeHash);
	return given.length === held.length && timingSafeEqual(given, held);
}
