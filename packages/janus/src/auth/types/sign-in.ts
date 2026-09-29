/**
 * What a sign-in answers: a session opened, or a second factor still to
 * prove.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
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
	/**
	 * Whether the session was opened from a device the user had not signed in
	 * from: the `device` given held no token, or one that did not prove this
	 * user signed in there before. Then `user.newDeviceSignedIn` was sent too.
	 * **`false` without a `device`**, and always on `signUp`.
	 */
	readonly newDevice: boolean;
	/**
	 * The device token for the client to keep — in a long-lived cookie — and
	 * to present as `device` at its next sign-in: the one it presented, a
	 * fresh one for a new device, or the same device signed again with the
	 * first key. **`null` without a `device`**: nothing is minted then.
	 */
	readonly deviceToken: string | null;
}

/**
 * What a sign-in takes besides its credentials: `signUp`, `signIn`,
 * `secondFactor.confirm`, `secondFactor.recover`, `signInCode.confirm` and
 * `magicLink.confirm`.
 */
export interface SignInOptions {
	/**
	 * The device token the client holds — the `deviceToken` an earlier
	 * sign-in answered — or `null` when it holds none yet. Absent, devices
	 * are not tracked for this call: `newDevice` is `false`, `deviceToken`
	 * `null`, and no event is sent. **Requires `janus({ devices })`.**
	 *
	 * A sign-in answering a second-factor challenge carries nothing to its
	 * confirmation: give the device again to `secondFactor.confirm` or
	 * `recover`.
	 */
	readonly device?: string | null;
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
