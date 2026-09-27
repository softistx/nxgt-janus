/**
 * A user's credentials as a store holds them: a password hash and a sealed
 * second-factor secret, both opaque to the store and kept byte for byte.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./types`.
 */

/** A password, as the store holds it: a self-describing hash, never the plain text. */
export interface PasswordRecord {
	/** Self-describing — `$argon2id$…`, `$scrypt$…` — so any wired verifier can read it. */
	readonly hash: string;
	readonly updatedAt: Date;
}

/**
 * A second factor, as the store holds it: a TOTP secret.
 *
 * **The secret is opaque to a store.** The core seals it with a key the
 * application holds — AES-256-GCM, `v1.<key id>.<iv>.<ciphertext>` — before a
 * store ever sees it, so a dump of the users cannot produce a code. A store
 * keeps the string byte for byte, like a password hash, and never parses it.
 */
export interface SecondFactorRecord {
	/** How the codes are made. `'totp'`, the codes of an authenticator app, is the only one. */
	readonly method: 'totp';
	/** The secret, opaque to a store: kept byte for byte. */
	readonly secret: string;
	/**
	 * When the user proved their app holds the secret, with a first code — or
	 * `null` while the enrolment waits for it. A second factor is asked for at
	 * sign-in only once confirmed.
	 */
	readonly confirmedAt: Date | null;
	/**
	 * The time step of the last code accepted, or `null` before the first. A
	 * code of this step or an earlier one is refused, so a code works once.
	 */
	readonly lastStep: number | null;
}
