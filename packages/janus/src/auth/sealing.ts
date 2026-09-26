import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * A second factor's secret, sealed before any store sees it: AES-256-GCM
 * under a key the application holds, so a dump of the users is not a dump of
 * everyone's authenticator.
 *
 * The sealed form is `v1.<key id>.<iv>.<ciphertext and tag>`, the last two in
 * base64url. It names its key, so keys rotate: the first key seals, every key
 * opens, and a secret sealed under an older one is sealed again under the
 * first the next time a code is accepted. The user's id is the additional
 * data, so a sealed secret copied onto another user does not open.
 */

/** One key, as `janus({ secondFactor: { keys } })` takes it. */
export interface SealingKey {
	/** Names the key in every secret it seals: letters, digits, `_` and `-`. */
	readonly id: string;
	/** 32 random bytes, in base64 or base64url: `openssl rand -base64 32`. */
	readonly key: string;
}

/** The keys, decoded and checked: the first seals. */
export interface Sealer {
	readonly sealWith: string;
	readonly keys: ReadonlyMap<string, Buffer>;
}

const KEY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const KEY = /^[A-Za-z0-9+/_-]{43}=?$/;

/** Decodes the keys and refuses what cannot seal. `where` names the option. */
export function resolveSealer(keys: unknown, where: string): Sealer {
	if (!Array.isArray(keys) || keys.length === 0) {
		throw new TypeError(
			`${where}: expected at least one key — [{ id, key }], the first seals`,
		);
	}
	const decoded = new Map<string, Buffer>();
	for (const entry of keys as readonly SealingKey[]) {
		const id = entry?.id;
		if (typeof id !== 'string' || !KEY_ID.test(id)) {
			throw new TypeError(
				`${where}: every key needs an id of letters, digits, _ and -, at most 64 of them`,
			);
		}
		if (decoded.has(id)) {
			throw new TypeError(`${where}: two keys have the id "${id}"`);
		}
		const key = entry.key;
		if (typeof key !== 'string' || !KEY.test(key)) {
			throw new TypeError(
				`${where}: the key "${id}" is not 32 bytes in base64 — make one with openssl rand -base64 32`,
			);
		}
		decoded.set(id, Buffer.from(key, 'base64'));
	}
	return { sealWith: (keys[0] as SealingKey).id, keys: decoded };
}

/** Seals `plain` under the first key, bound to `boundTo` — the user's id. */
export function seal(sealer: Sealer, plain: string, boundTo: string): string {
	const key = sealer.keys.get(sealer.sealWith) as Buffer;
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, iv);
	cipher.setAAD(Buffer.from(boundTo));
	const sealed = Buffer.concat([
		cipher.update(plain, 'utf8'),
		cipher.final(),
		cipher.getAuthTag(),
	]);
	return `v1.${sealer.sealWith}.${iv.toString('base64url')}.${sealed.toString('base64url')}`;
}

/**
 * Opens a sealed secret, and says which key sealed it.
 *
 * Every failure is a **wiring** mistake, a bare `TypeError`: a key taken out
 * of `keys` while secrets it sealed are still stored, or a key changed under
 * the same id. None of them comes from a request.
 */
export function unseal(
	sealer: Sealer,
	sealed: string,
	boundTo: string,
	where: string,
): { readonly plain: string; readonly keyId: string } {
	const [version, keyId, iv, body] = sealed.split('.');
	if (
		version !== 'v1' ||
		keyId === undefined ||
		iv === undefined ||
		body === undefined
	) {
		throw new TypeError(`${where}: the stored secret is not a sealed one`);
	}
	const key = sealer.keys.get(keyId);
	if (key === undefined) {
		throw new TypeError(
			`${where}: the secret is sealed with the key "${keyId}", which secondFactor.keys no longer holds — keep a key until no secret is sealed with it`,
		);
	}
	const bytes = Buffer.from(body, 'base64url');
	try {
		const decipher = createDecipheriv(
			'aes-256-gcm',
			key,
			Buffer.from(iv, 'base64url'),
		);
		decipher.setAAD(Buffer.from(boundTo));
		decipher.setAuthTag(bytes.subarray(bytes.length - 16));
		const plain = Buffer.concat([
			decipher.update(bytes.subarray(0, bytes.length - 16)),
			decipher.final(),
		]).toString('utf8');
		return { plain, keyId };
	} catch (cause) {
		throw new TypeError(
			`${where}: the secret does not open with the key "${keyId}" — was that key changed under the same id?`,
			{ cause },
		);
	}
}
