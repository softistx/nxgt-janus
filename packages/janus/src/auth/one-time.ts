import { randomInt, timingSafeEqual } from 'node:crypto';
import { TokenError } from '../errors/janus-error';
import type { Context } from './context';
import type { TokenKind, TokenRecord } from './port/types';
import { hashSecret, mintSecret } from './secrets';

/**
 * The rules every one-time token shares — an e-mail link, a second-factor
 * challenge — kept in one place so the two cannot drift apart.
 *
 * `noun` is what the messages call it: `token` for a link, `challenge` for
 * what `signIn` answers. No message names the secret or its hash.
 */
export type OneTimeNoun = 'token' | 'challenge';

/**
 * How many codes one challenge takes — a second factor's or an e-mail
 * code's. A six-digit code has a million values: five attempts is a
 * one-in-200,000 chance, and the attempts are counted by the store in one
 * write, never read then written.
 */
export const CODE_ATTEMPTS = 5;

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

/**
 * Issues a one-time token: 32 random bytes, given back once, and only their
 * hash stored. With `code`, a six-digit code too, for a person to type: only
 * its hash is stored, keyed by the token.
 */
export async function issueOneTime(
	context: Context,
	token: {
		readonly kind: TokenKind;
		readonly userId: string;
		readonly address: string;
		readonly ttlMs: number;
		readonly code?: boolean;
	},
): Promise<{
	readonly secret: string;
	readonly expiresAt: Date;
	readonly code: string | null;
}> {
	const now = context.clock.now();
	const secret = mintSecret();
	const expiresAt = new Date(now.getTime() + token.ttlMs);
	const code =
		token.code === true ? String(randomInt(1_000_000)).padStart(6, '0') : null;

	await context.store.tokens.insertToken({
		tokenHash: hashSecret(secret),
		kind: token.kind,
		userId: token.userId,
		address: token.address,
		codeHash: code === null ? null : hashCode(secret, code),
		attempts: 0,
		expiresAt,
		spentAt: null,
		createdAt: now,
	});
	return { secret, expiresAt, code };
}
