/**
 * Signing in with a password: the policy a user type declares, and the
 * hashing port that writes and checks the hashes.
 */

import type { Normalize } from './normalize';

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

/** Signing in with a password. */
export interface PasswordConfig {
	/**
	 * The field users sign in with: a **top-level, required string** field of
	 * the schema — `'email'`, `'username'`. A typo is a compile error.
	 */
	readonly login: string;
	/** `'lowercaseTrim'` when absent. */
	readonly normalize?: Normalize;
	/** At least 1. `8` when absent. */
	readonly minLength?: number;
}
