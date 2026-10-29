/**
 * The password flows of a user type: signing up, signing in, and setting or
 * changing a password.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { PreparedSignUp } from './prepared';
import type { SignedIn, SignInOptions, SignInResult } from './sign-in';
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
	 *
	 * Given a `device`, mints the user's first device token: the device they
	 * signed up on is known from the start, and never reported as new.
	 */
	signUp: (
		input: In & { readonly password: string },
		options?: SignInOptions,
	) => Promise<SignedIn<U>>;

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
	 * **Throttled per login**, on by default: past ten passwords tried at one
	 * login in a 15-minute window — known or not — every one is
	 * `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter`, the
	 * seconds until the next window, the right password included. Nothing
	 * locks; a sign-in that succeeds starts the count again. See
	 * `janus({ signIn: { throttle } })`. A tokens store that cannot count is
	 * `STORE_FAILED`.
	 *
	 * With a `secondFactor` configured, a user whose factor is active gets no
	 * session yet: `{ status: 'secondFactor', challenge }`, for
	 * `secondFactor.confirm`. Switch on `status`.
	 *
	 * Given a `device`, answers `newDevice` and `deviceToken`, and sends
	 * `user.newDeviceSignedIn` for a device new to the user. A challenge
	 * carries no device: give it again to `secondFactor.confirm`.
	 */
	signIn(
		input: { readonly [K in Login]: string } & { readonly password: string },
		options?: SignInOptions,
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
	 * `CREDENTIALS_INVALID` when `current` is wrong. Each call is counted in
	 * the sign-in throttle of the user's login, whose budget `signIn` shares:
	 * past the limit it is `CREDENTIALS_INVALID` with `reason: 'throttled'` and
	 * `retryAfter`, the right `current` included, and a change that is written
	 * restarts the count; that restart runs after the write, so a `STORE_FAILED`
	 * from it leaves the password changed: check with `signIn` using `next`
	 * before retrying. Other sessions stay open: call
	 * `signOutEverywhere(user, { except })` for that.
	 */
	changePassword(
		user: UserRef,
		change: { readonly current: string; readonly next: string },
		options?: WriteOptions,
	): Promise<U>;
}

/**
 * `signUp.prepare`, on a user type whose **login is its e-mail field**: the
 * typed address is the holder's address, so the `taken` notice goes to the
 * person who typed it. A type that signs in with another field (a username)
 * has no `prepare`, since a taken username would reveal an account and mail a
 * stranger.
 */
export interface SignUpPrepareApi<U, In> {
	readonly signUp: {
		/**
		 * `signUp` for an application that verifies the e-mail and answers
		 * the same for a new address and a taken one, in two steps.
		 *
		 * `prepare` runs in the visitor's request and looks nobody up: it
		 * validates the fields (`USER_INVALID`), checks the password against
		 * the policy (`PASSWORD_TOO_SHORT`) and counts the attempt per address
		 * (`MAIL_THROTTLED` with `retryAfter`, `janus({ mail: { throttle } })`)
		 * — the same store calls whatever the address.
		 *
		 * `send()` on the answer, run off the request, creates the user and
		 * issues a verification token — `{ status: 'created', user, issued }`,
		 * **no session** — or, for a login already held, writes nothing and
		 * answers `{ status: 'taken', user }`. Mail `issued` in the first
		 * case, a "somebody tried to sign up" notice in the second. Pair it with
		 * `password: { requireVerifiedEmail: true }` so the address must be
		 * verified before a session opens.
		 */
		prepare(
			input: In & { readonly password: string },
		): Promise<PreparedSignUp<U>>;
	};
}
