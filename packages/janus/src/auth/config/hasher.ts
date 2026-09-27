/** The password hashing port: what writes a password's hash, and checks one. */

/**
 * A password hashing scheme — the second port.
 *
 * Hashes are self-describing, so **every wired hasher can verify, and exactly
 * one hashes** new passwords. A database written under Bun reads under Node and
 * back, as long as a verifier for each prefix is wired.
 */
export interface PasswordHasher {
	/** The prefix every hash it writes starts with: `'$argon2id$'`, `'$scrypt$'`. */
	readonly prefix: string;
	hash(plain: string): Promise<string>;
	verify(plain: string, hash: string): Promise<boolean>;
	/**
	 * Whether a hash **this hasher** wrote should be written again: its
	 * parameters are not the ones `hash` uses now — a raised `cost`, say.
	 * Optional; without it only a hash from another hasher (a `verifiers` one)
	 * is rewritten. Called with hashes carrying this hasher's prefix only.
	 */
	needsRehash?(hash: string): boolean;
}
