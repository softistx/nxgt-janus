import { createHmac, hkdfSync } from 'node:crypto';
import type { Sealer } from './sealing';

/**
 * Keys derived from the sealing keys, one per purpose — never the key that
 * seals a secret itself — and the keyed hashes made with them: a recovery
 * code's, and the names of the counts of attempts. Each caller keeps its own
 * purpose: renamed, what it hashed no longer matches.
 */

const derived = new WeakMap<Sealer, Map<string, Buffer>>();

/**
 * The key `keyId` lends `purpose` — the first key by default — derived once
 * per key, or `undefined` when the sealer no longer holds that key.
 */
export function derivedKey(
	sealer: Sealer,
	purpose: string,
	keyId: string = sealer.sealWith,
): Buffer | undefined {
	let keys = derived.get(sealer);
	if (keys === undefined) {
		keys = new Map();
		derived.set(sealer, keys);
	}
	const name = `${purpose}\u0000${keyId}`;
	let key = keys.get(name);
	if (key === undefined) {
		const secret = sealer.keys.get(keyId);
		if (secret === undefined) return undefined;
		key = Buffer.from(hkdfSync('sha256', secret, Buffer.alloc(0), purpose, 32));
		keys.set(name, key);
	}
	return key;
}

/** HMAC-SHA256 of `parts`, joined by a NUL — which no part may hold. */
export function keyedHash(key: Buffer, parts: readonly string[]): Buffer {
	return createHmac('sha256', key).update(parts.join('\u0000')).digest();
}
