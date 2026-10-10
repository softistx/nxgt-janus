/**
 * The key that names a count of attempts stored under no user — the
 * passwords tried at a login (`sign-in-attempts.ts`), the e-mails asked for
 * an address (`mail-requests.ts`) — and the keyed hashes made with it.
 *
 * Derived from the sealing keys when `secondFactor` is configured; without
 * them it is a fixed one, and the hash only keeps the login or the address
 * out of plain sight — safe because a `secondFactor` token is redeemed only
 * by the second factor's flows, which do not exist without the keys.
 */

import type { Context } from './context';
import { derivedKey, keyedHash } from './derived-keys';

/**
 * The key `purpose` names its counts with. Renamed, a purpose's every count
 * in progress would start over.
 */
export function counterKey(context: Context, purpose: string): Buffer {
	const sealer = context.config.secondFactor?.sealer;
	// The first key is always held: resolveSealer names it from the keys.
	return sealer === undefined
		? Buffer.from(purpose)
		: (derivedKey(sealer, purpose) as Buffer);
}

/** A keyed hash of `parts`, base64url: a name, never a secret. */
export const keyed = (key: Buffer, parts: readonly string[]): string =>
	keyedHash(key, parts).toString('base64url');
