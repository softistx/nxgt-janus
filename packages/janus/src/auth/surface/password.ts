/**
 * The password flows of a user type: signing up, signing in, and setting or
 * changing a password.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { SignedIn, SignInResult } from './sign-in';
import type { UserRef, WriteOptions } from './user';

/**
 * What a user type that signs in with a password answers besides.
 *
 * `Answer` is what `signIn` answers: {@link SignedIn}, or {@link SignInResult}
 * once `janus()` is given a `secondFactor`.
 */
export interface PasswordApi<
	U,
	In,
	Login extends string,
	Answer = SignedIn<U>,
> {
	/**
	 * Creates the user and signs them in.
	 *
	 * Rejects with `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN`, or
	 * `STORE_FAILED`.
	 */
	signUp(input: In & { readonly password: string }): Promise<SignedIn<U>>;

	/**
	 * Checks the password and opens a session.
	 *
	 * Rejects with `CREDENTIALS_INVALID` — one code for an unknown login, a user
	 * with no password and a wrong password, so a response cannot tell which
	 * accounts exist; `reason` tells them apart for your logs. When nobody holds
	 * the login, a dummy hash is still compared, so the time taken does not say
	 * so either. **The store's own latency stays observable**, and that limit is
	 * documented rather than denied. An inactive user who gave the right
	 * password is `USER_INACTIVE`.
	 *
	 * With a `secondFactor` configured, a user whose factor is active gets no
	 * session yet: `{ status: 'secondFactor', challenge }`, for
	 * `secondFactor.confirm`. Switch on `status`.
	 */
	signIn(
		input: { readonly [K in Login]: string } & { readonly password: string },
	): Promise<Answer>;

	/** The user holding this login, normalised as sign-up normalised it, or `null`. */
	findByLogin(login: string): Promise<U | null>;

	/** Sets or replaces the password — an admin's call. `PASSWORD_TOO_SHORT` below the policy. */
	setPassword(
		user: UserRef,
		password: string,
		options?: WriteOptions,
	): Promise<U>;

	/**
	 * Replaces the password after checking the current one — the user's call.
	 * `CREDENTIALS_INVALID` when `current` is wrong. Other sessions stay open:
	 * call `signOutEverywhere(user, { except })` for that.
	 */
	changePassword(
		user: UserRef,
		change: { readonly current: string; readonly next: string },
		options?: WriteOptions,
	): Promise<U>;
}
