/** Signing in with a password: the login field, and the password policy. */

import type { Normalize } from './normalize';

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
