/**
 * What a sign-in answers: a session opened, or a second factor still to
 * prove.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { Id } from '../../ids/id';
import type { Session } from './session';

/**
 * A session just opened. **The token is here and nowhere else**: the store
 * holds its hash. Put it in a cookie with `auth.cookie.serialize`, or hand it
 * to a client that sends it as `Authorization: Bearer`.
 */
export interface SignedIn<U> {
	readonly status: 'signedIn';
	readonly user: U;
	readonly session: Session;
	readonly token: string;
}

/**
 * The password was right, and the user has a second factor: no session yet.
 * Ask for a code, then call `secondFactor.confirm(challenge, code)`.
 *
 * **The challenge is a secret** like a session token: keep it where the
 * visitor's next request can present it — a short-lived cookie, or the body
 * of your code form — and never in a URL or a log.
 */
export interface SecondFactorRequired {
	readonly status: 'secondFactor';
	readonly challenge: string;
	/** When the challenge lapses. Five minutes after `signIn`, by default. */
	readonly expiresAt: Date;
	/**
	 * Whose sign-in waits for its code — for your logs and your rate limits.
	 * **Not for the visitor**: they have proved a password or an e-mail, not
	 * yet who they are, so answer them the challenge alone.
	 */
	readonly userId: Id;
}

/** What `signIn` answers once a second factor is configured: switch on `status`. */
export type SignInResult<U> = SignedIn<U> | SecondFactorRequired;
