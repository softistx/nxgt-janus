/**
 * The refusals of a one-time token that could not be used: none, spent,
 * lapsed, or sent to an e-mail the user no longer has.
 */

import { TokenError } from '../../errors/janus-error';
import { normalizeEmail, type ResolvedType } from '../config';
import { emailOf } from '../context';
import type { TokenRecord, UserRecord } from '../port/types';

/**
 * The rules every one-time token shares — an e-mail link, a second-factor
 * challenge — kept in one place so the two cannot drift apart.
 *
 * `noun` is what the messages call it: `token` for a link, `challenge` for
 * what `signIn` answers. No message names the secret or its hash.
 */
export type OneTimeNoun = 'token' | 'challenge';

/**
 * Refuses a token sent to an e-mail the user no longer has: redeeming it
 * would prove an address nobody holds any more.
 */
export function refuseStale(
	type: ResolvedType,
	user: UserRecord,
	token: TokenRecord,
	where: string,
	noun: 'token' | 'code',
): void {
	const email = emailOf(type, user.fields);
	if (
		email === null ||
		normalizeEmail(email) !== normalizeEmail(token.address)
	) {
		throw new TokenError(
			'TOKEN_STALE',
			`${where}: the ${noun} was sent to an e-mail the user no longer has`,
			{ operation: where, userId: user.id, userType: type.name },
		);
	}
}

/**
 * Refuses a token that cannot be used: none, spent, or lapsed. What a store
 * answered — before a `consumeToken`, after a `countAttempt` — is read the
 * same way: `spentAt` set means somebody else used it.
 */
export function refuseUnusable(
	token: TokenRecord | null,
	now: Date,
	where: string,
	noun: OneTimeNoun,
): asserts token is TokenRecord {
	if (token === null) {
		throw new TokenError('TOKEN_UNKNOWN', `${where}: no such ${noun}`, {
			operation: where,
		});
	}
	if (token.spentAt !== null) {
		throw new TokenError(
			'TOKEN_SPENT',
			`${where}: the ${noun} was already used`,
			{ operation: where },
		);
	}
	if (token.expiresAt.getTime() <= now.getTime()) {
		throw new TokenError('TOKEN_EXPIRED', `${where}: the ${noun} has expired`, {
			operation: where,
		});
	}
}

/** The refusal for a token whose user is gone, or of another type. */
export const unknownOneTime = (where: string, noun: OneTimeNoun) =>
	new TokenError('TOKEN_UNKNOWN', `${where}: no such ${noun}`, {
		operation: where,
	});
