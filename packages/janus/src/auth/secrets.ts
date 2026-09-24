import { createHash, randomBytes } from 'node:crypto';

/**
 * A fresh secret: 32 random bytes, base64url — safe in a header, a cookie and a
 * URL without escaping.
 *
 * Given to the application **once**. No store ever holds it.
 */
export function mintSecret(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * What a store holds instead of the secret: `sha256`, hex.
 *
 * SHA-256 and not argon2, on purpose. The secret carries 256 bits of entropy, so
 * there is nothing to brute-force, and an argon2 per request would put ~50 ms on
 * every authenticated call. What the hash buys is that a dump of the store
 * cannot be replayed.
 */
export function hashSecret(secret: string): string {
	return createHash('sha256').update(secret).digest('hex');
}
