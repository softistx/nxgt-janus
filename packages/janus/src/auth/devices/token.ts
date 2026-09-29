import { randomBytes, timingSafeEqual } from 'node:crypto';
import { derivedKey, keyedHash } from '../derived-keys';
import type { Sealer } from '../sealing';

/**
 * A device token: `d1.<key id>.<device id>.<mac>`, the last two in
 * base64url. The device id is 16 random bytes; the mac is an HMAC-SHA256 of
 * the user's id and the device id, under a key derived for this purpose from
 * `devices.keys`. **Nothing is stored**: the token is its own proof that this
 * user signed in on this device before, and a token copied onto another user
 * proves nothing.
 *
 * Every character is a cookie-value character, so it goes in a cookie as is.
 */

/** What the key is derived for. Renamed, every device would be new again. */
const PURPOSE = 'janus/devices/v1';

const TOKEN =
	/^d1\.([A-Za-z0-9_-]{1,64})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/;

function macOf(key: Buffer, userId: string, deviceId: string): Buffer {
	return keyedHash(key, [userId, deviceId]);
}

function signed(sealer: Sealer, userId: string, deviceId: string): string {
	// The first key is always held: resolveSealer names it from the keys.
	const key = derivedKey(sealer, PURPOSE) as Buffer;
	const mac = macOf(key, userId, deviceId).toString('base64url');
	return `d1.${sealer.sealWith}.${deviceId}.${mac}`;
}

/** A token for a device never seen: a fresh device id, signed with the first key. */
export function mintDeviceToken(sealer: Sealer, userId: string): string {
	return signed(sealer, userId, randomBytes(16).toString('base64url'));
}

/**
 * The token to hand back when `presented` proves this user signed in on this
 * device before — itself, or the same device signed again with the first key
 * when an older key signed it — or `null` when it proves nothing: malformed,
 * another user's, forged, or signed with a key no longer held.
 *
 * `presented` comes from a request, so nothing here throws.
 */
export function knownDeviceToken(
	sealer: Sealer,
	userId: string,
	presented: string,
): string | null {
	const parts = TOKEN.exec(presented);
	if (parts === null) return null;
	const [, keyId, deviceId, mac] = parts as unknown as [
		string,
		string,
		string,
		string,
	];
	const key = derivedKey(sealer, PURPOSE, keyId);
	if (key === undefined) return null;

	const expected = macOf(key, userId, deviceId);
	const given = Buffer.from(mac, 'base64url');
	if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
		return null;
	}
	return keyId === sealer.sealWith
		? presented
		: signed(sealer, userId, deviceId);
}
