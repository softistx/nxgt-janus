import { createHmac, randomBytes } from 'node:crypto';

/**
 * RFC 6238 as every authenticator app reads it: HMAC-SHA-1, six digits, a
 * thirty-second step. None of the three is configurable, on purpose — an app
 * that ignores `algorithm` or `digits` in the URI, and several do, would show
 * a code the server never accepts.
 */
export const TOTP = { digits: 6, stepMs: 30_000, drift: 1 } as const;

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** A fresh TOTP secret: 20 random bytes — SHA-1's block of key — in base32. */
export function mintTotpSecret(): string {
	return toBase32(randomBytes(20));
}

/** RFC 4648 base32, without padding: what an `otpauth://` URI carries. */
export function toBase32(bytes: Uint8Array): string {
	let bits = 0;
	let value = 0;
	let out = '';
	for (const byte of bytes) {
		value = (value << 8) | byte;
		bits += 8;
		while (bits >= 5) {
			out += BASE32[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}
	if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
	return out;
}

export function fromBase32(text: string): Buffer {
	let bits = 0;
	let value = 0;
	const out: number[] = [];
	for (const char of text) {
		const index = BASE32.indexOf(char);
		if (index === -1) throw new TypeError('totp: the secret is not base32');
		value = (value << 5) | index;
		bits += 5;
		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 255);
			bits -= 8;
		}
	}
	return Buffer.from(out);
}

/** The step a moment falls in: whole thirty-second periods since the epoch. */
export const stepAt = (now: Date): number =>
	Math.floor(now.getTime() / TOTP.stepMs);

/** RFC 4226's code for one counter value, zero-padded to six digits. */
export function codeAt(secret: Buffer, step: number): string {
	const counter = Buffer.alloc(8);
	counter.writeBigUInt64BE(BigInt(step));
	const digest = createHmac('sha1', secret).update(counter).digest();
	const offset = (digest[19] as number) & 0x0f;
	const binary = digest.readUInt32BE(offset) & 0x7fffffff;
	return String(binary % 10 ** TOTP.digits).padStart(TOTP.digits, '0');
}

/**
 * The step this code was shown at — the current one, or one either side for a
 * clock that drifted — or `null`.
 *
 * **Only a step after `lastStep` counts**, so a code is used once: the caller
 * writes the step it got back, and a replay of the same code finds nothing.
 * Every candidate is computed, so the time taken does not say which matched.
 */
export function matchStep(
	secret: Buffer,
	code: string,
	now: Date,
	lastStep: number | null,
): number | null {
	if (!/^\d{6}$/.test(code)) return null;
	const current = stepAt(now);
	let matched: number | null = null;
	for (let step = current - TOTP.drift; step <= current + TOTP.drift; step++) {
		const fresh = lastStep === null || step > lastStep;
		if (equalCodes(codeAt(secret, step), code) && fresh && matched === null) {
			matched = step;
		}
	}
	return matched;
}

/** Compares two six-digit strings without stopping at the first difference. */
function equalCodes(a: string, b: string): boolean {
	let difference = a.length ^ b.length;
	for (let i = 0; i < a.length; i++) {
		difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return difference === 0;
}

/**
 * The `otpauth://` URI an authenticator app reads from a QR code. The label is
 * `issuer:account`, each part percent-encoded, and `issuer` is repeated as a
 * parameter, as Google Authenticator requires.
 */
export function otpauthUri(
	issuer: string,
	account: string,
	secret: string,
): string {
	const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
	const query = new URLSearchParams({
		secret,
		issuer,
		algorithm: 'SHA1',
		digits: String(TOTP.digits),
		period: String(TOTP.stepMs / 1000),
	});
	return `otpauth://totp/${label}?${query}`;
}
