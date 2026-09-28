/**
 * What a user type with a password answers besides once `janus()` is given a
 * `secondFactor`: a TOTP second factor, from enrolment to the code `signIn`
 * asks for.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
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
 * What `secondFactor.activate` and `regenerateRecoveryCodes` answer: the user,
 * and **ten recovery codes, shown once**. Only their hashes are stored, so no
 * call answers them again.
 */
export interface RecoveryCodesIssued<U> {
	readonly user: U;
	/** `xxxxx-xxxxx`, each accepted once by `secondFactor.recover`. */
	readonly recoveryCodes: readonly string[];
}

/** What `secondFactor.recover` answers: the session, and how many codes are left. */
export type RecoveredSignIn<U> = SignedIn<U> & {
	/** The user's recovery codes still unused, this one spent. `0`: regenerate them. */
	readonly recoveryCodesLeft: number;
};

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
		 * then on `signIn` asks for a code. Answers the user and ten recovery
		 * codes, **shown once**. `CODE_INVALID` when the code does not match,
		 * `SECOND_FACTOR_NOT_ENROLLED` before `enroll`.
		 */
		activate(
			user: UserRef,
			code: string,
			options?: WriteOptions,
		): Promise<RecoveryCodesIssued<U>>;
		/**
		 * Replaces the user's recovery codes with ten new ones, answered once,
		 * on a fresh code from the app: the old ones stop working.
		 * `CODE_INVALID` when the code does not match or was already used,
		 * `SECOND_FACTOR_NOT_ENROLLED` without an active factor.
		 *
		 * It takes **five attempts per user per 15-minute window**, counted by
		 * the store: a code that does not match is `CODE_INVALID` with
		 * `attemptsLeft`, and past the fifth every call is `CODE_INVALID` with
		 * `attemptsLeft: 0`, the right code included, until the next window. A
		 * code accepted — here, or at sign-in — starts the count again.
		 */
		regenerateRecoveryCodes(
			user: UserRef,
			code: string,
			options?: WriteOptions,
		): Promise<RecoveryCodesIssued<U>>;
		/** Removes the factor, active or waiting, and its recovery codes. A user without one is answered as is. */
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
		/**
		 * Redeems `signIn`'s challenge with a **recovery code** instead of the
		 * app's, for a user whose phone is gone, and opens the session. The
		 * code is spent; `recoveryCodesLeft` says how many remain.
		 *
		 * The challenge's attempts are the ones `confirm` counts, and it is
		 * refused the same ways. A code that does not match, or was already
		 * used, is `CODE_INVALID` with `attemptsLeft`; the same code used by
		 * two sign-ins at once opens one session, and the other call is
		 * `VERSION_CONFLICT`.
		 */
		recover(challenge: string, code: string): Promise<RecoveredSignIn<U>>;
	};
}
