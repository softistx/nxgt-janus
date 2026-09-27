/**
 * Spending a one-time token: once when it is redeemed, and once more when its
 * last attempt failed.
 */

import type { Context } from '../context';
import type { TokenKind, TokenRecord } from '../port/types';
import { hashSecret } from '../secrets';
import { type OneTimeNoun, refuseUnusable } from './refusals';

/**
 * Spends a token, and refuses it when this call did not: the store answers it
 * **as it was before**, so exactly one call ever reads `spentAt: null`. A
 * lapsed token is spent all the same, so it cannot be retried.
 */
export async function spendOneTime(
	context: Context,
	secret: string,
	kind: TokenKind,
	where: string,
	noun: OneTimeNoun,
): Promise<TokenRecord> {
	const now = context.clock.now();
	const token = await context.store.tokens.consumeToken(
		hashSecret(secret),
		kind,
		now,
	);
	refuseUnusable(token, now, where, noun);
	return token;
}

/**
 * Spends a token whose last attempt failed. Its answer is not read: a racing
 * call that spent it first changes nothing for this one, which is refused
 * for its code either way.
 */
export async function burnOneTime(
	context: Context,
	secret: string,
	kind: TokenKind,
): Promise<void> {
	await context.store.tokens.consumeToken(
		hashSecret(secret),
		kind,
		context.clock.now(),
	);
}
