/**
 * What a user type with a password answers besides once `janus()` is given a
 * `secondFactor`: a TOTP second factor, from enrolment to the code `signIn`
 * asks for.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { SignedIn } from './sign-in';
import type { UserRef, WriteOptions } from './user';

/** What `secondFactor.enroll` answers: show both, keep neither. */
export interface SecondFactorEnrolment {
	/** The TOTP secret, in base32: for a user who types it in instead of scanning. */
	readonly secret: string;
	/** The `otpauth://` URI to render as a QR code. */
	readonly uri: string;
}

/**
 * What a user type with a password answers besides, once `janus()` is given a
 * `secondFactor`: a TOTP second factor, from the first QR code to the code
 * `signIn` asks for.
 *
 * A factor is **enrolled** by `enroll`, **active** once `activate` accepted a
 * first code, and gone after `disable`. Only an active one is asked for.
 */
export interface SecondFactorApi<U> {
	readonly secondFactor: {
		/**
		 * Mints a TOTP secret, seals it onto the user, and answers it with the
		 * URI to show as a QR code. The factor waits for `activate`; a factor
		 * already waiting is replaced. `SECOND_FACTOR_ACTIVE` when one is active.
		 */
		enroll(
			user: UserRef,
			options?: WriteOptions,
		): Promise<SecondFactorEnrolment>;
		/**
		 * Checks a first code from the app, and makes the factor active: from
		 * then on `signIn` asks for a code. `CODE_INVALID` when it does not match,
		 * `SECOND_FACTOR_NOT_ENROLLED` before `enroll`.
		 */
		activate(user: UserRef, code: string, options?: WriteOptions): Promise<U>;
		/** Removes the factor, active or waiting. A user without one is answered as is. */
		disable(user: UserRef, options?: WriteOptions): Promise<U>;
		/**
		 * Redeems `signIn`'s challenge with a code, and opens the session.
		 *
		 * A challenge takes **five attempts**: a code that does not match is
		 * `CODE_INVALID` with `attemptsLeft`, and the fifth spends the challenge.
		 * A code is accepted once, so a replay is `CODE_INVALID` too. An unknown,
		 * spent or lapsed challenge is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`: sign in again.
		 */
		confirm(challenge: string, code: string): Promise<SignedIn<U>>;
	};
}
