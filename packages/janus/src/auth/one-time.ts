import { randomInt, timingSafeEqual } from 'node:crypto';
import { TokenError } from '../errors/janus-error';
import { normalizeEmail, type ResolvedType } from './config';
import { type Context, emailOf } from './context';
import type { TokenKind, TokenRecord, UserRecord } from './port/types';
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

interface OneTimeRequest {
	readonly kind: TokenKind;
	readonly userId: string;
	readonly address: string;
	readonly ttlMs: number;
}

/**
 * Issues a one-time token: 32 random bytes, given back once, and only their
 * hash stored.
 */
export async function issueOneTime(
	context: Context,
	token: OneTimeRequest,
): Promise<{ readonly secret: string; readonly expiresAt: Date }> {
	return insertOneTime(context, token, null);
}

/**
 * Issues a one-time token with a six-digit code for a person to type: the
 * token is the challenge, and only the code's hash is stored, keyed by it.
 */
export async function issueCode(
	context: Context,
	token: OneTimeRequest,
): Promise<{
	readonly secret: string;
	readonly expiresAt: Date;
	readonly code: string;
}> {
	const code = String(randomInt(1_000_000)).padStart(6, '0');
	return { ...(await insertOneTime(context, token, code)), code };
}

async function insertOneTime(
	context: Context,
	token: OneTimeRequest,
	code: string | null,
): Promise<{ readonly secret: string; readonly expiresAt: Date }> {
	const now = context.clock.now();
	const secret = mintSecret();
	const expiresAt = new Date(now.getTime() + token.ttlMs);

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
	return { secret, expiresAt };
}
