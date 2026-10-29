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
	/**
	 * `false` when absent. With `true`, a correct password on an address never
	 * verified is refused with `EMAIL_UNVERIFIED` and opens no session; a wrong
	 * password answers `CREDENTIALS_INVALID` as ever. Verify the address with
	 * `verifyEmail`, or the sign-in code or link, first.
	 */
	readonly requireVerifiedEmail?: boolean;
}
