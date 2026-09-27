/**
 * Issuing a one-time token — a link's, or a challenge carrying a code for a
 * person to type. The secret is given back once; the store holds its hash.
 */

import { randomInt } from 'node:crypto';
import type { Context } from '../context';
import type { TokenKind } from '../port/types';
import { hashSecret, mintSecret } from '../secrets';
import { hashCode } from './codes';

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
