import { randomInt, timingSafeEqual } from 'node:crypto';
import { derivedKey, keyedHash } from '../derived-keys';
import type { Sealer } from '../sealing';

/**
 * A second factor's recovery codes: minted, hashed with a key derived from
 * the sealing keys, and found again.
 *
 * A code is **ten characters of Crockford's base32** — digits and lower-case
 * letters without `i`, `l`, `o` and `u` — shown as `xxxxx-xxxxx`: fifty bits,
 * typable off a sheet of paper. Only its hash is stored, **keyed** rather
 * than a bare `sha256`, like a sign-in code's: a dump of the users, without
 * the keys, cannot check a guess. The hash is `v1.<key id>.<mac>`, so it
 * names its key as a sealed secret does, and a rotation keeps it readable.
 * The user's id is part of what is hashed: a hash copied onto another user
 * matches nothing.
 */

/** How many codes `activate` and `regenerateRecoveryCodes` answer. */
export const RECOVERY_CODES = 10;

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const LENGTH = 10;
const SHAPE = /^[0-9a-hjkmnp-tv-z]{10}$/;

/** What the key is derived for: never the key that seals a secret itself. */
const PURPOSE = 'janus/second-factor/recovery-codes/v1';

/** Fresh codes, as the user is shown them once: `7k2mq-x9d4c`. */
export function mintRecoveryCodes(): string[] {
	return Array.from({ length: RECOVERY_CODES }, () => {
		let code = '';
		for (let at = 0; at < LENGTH; at += 1) {
			code += ALPHABET[randomInt(ALPHABET.length)];
		}
		return `${code.slice(0, 5)}-${code.slice(5)}`;
	});
}

/**
 * A code as typed, read as the one it could be — case, spaces and dashes
 * ignored, `o` read as `0`, `i` and `l` as `1` — or `null` for one that
 * cannot be a code at all.
 */
export function readRecoveryCode(typed: string): string | null {
	const code = typed
		.toLowerCase()
		.replace(/[\s-]/g, '')
		.replace(/o/g, '0')
		.replace(/[il]/g, '1');
	return SHAPE.test(code) ? code : null;
}

/** The key a sealing key lends the codes, derived once per key. */
const macKey = (sealer: Sealer, keyId: string): Buffer | undefined =>
	derivedKey(sealer, PURPOSE, keyId);

const mac = (key: Buffer, userId: string, code: string): Buffer =>
	keyedHash(key, [userId, code]);

/** A code's keyed hash, under the first key, bound to the user's id. */
export function hashRecoveryCode(
	sealer: Sealer,
	userId: string,
	code: string,
): string {
	const read = readRecoveryCode(code) ?? code;
	const key = macKey(sealer, sealer.sealWith) as Buffer;
	return `v1.${sealer.sealWith}.${mac(key, userId, read).toString('base64url')}`;
}

/**
 * Where `typed` is among the user's hashes, or `-1`. Every hash is compared,
 * in constant time, whether or not one matched already.
 *
 * A hash naming a key the sealer no longer holds is a **wiring** mistake, a
 * bare `TypeError`, as for a sealed secret: never a `CODE_INVALID` that would
 * blame the user.
 */
export function findRecoveryCode(
	sealer: Sealer,
	userId: string,
	hashes: readonly string[],
	typed: string,
	where: string,
): number {
	const code = readRecoveryCode(typed);
	let found = -1;
	hashes.forEach((hash, index) => {
		const [version, keyId, body, ...rest] = hash.split('.');
		if (
			version !== 'v1' ||
			keyId === undefined ||
			body === undefined ||
			rest.length > 0
		) {
			throw new TypeError(
				`${where}: a stored recovery code is not a keyed hash`,
			);
		}
		const key = macKey(sealer, keyId);
		if (key === undefined) {
			throw new TypeError(
				`${where}: a recovery code is hashed with the key "${keyId}", which secondFactor.keys no longer holds — keep a key until no secret or recovery code uses it`,
			);
		}
		if (code === null) return;
		const held = Buffer.from(body, 'base64url');
		const given = mac(key, userId, code);
		if (held.length === given.length && timingSafeEqual(held, given)) {
			found = found === -1 ? index : found;
		}
	});
	return found;
}
