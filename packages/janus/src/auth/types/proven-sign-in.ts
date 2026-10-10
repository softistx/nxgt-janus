/**
 * What every user type answers besides: signing in a user the application
 * proved by its own means, with no credential janus checks.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { SignedIn, SignInOptions } from './sign-in';
import type { UserRef } from './user';

/**
 * Signing in a user **the application has already proved** — by an
 * invitation token it issued and the person followed, or a channel of its
 * own it verified — without a password, a code or a link.
 *
 * `Answer` is `SignInResult` when the type may have a second factor: the
 * application's proof is a first factor, and an active factor is still asked
 * for.
 */
export interface ProvenSignInApi<U, Answer = SignedIn<U>> {
	/**
	 * Signs in the user of this type with this id, and answers what every
	 * other sign-in answers: a session, or a second-factor challenge when
	 * their factor is active — switch on `status`.
	 *
	 * **Privileged: janus checks no credential here, the application carries
	 * the proof.** Call it only after your server verified one — an
	 * invitation token it issued, a channel of its own — and never with an
	 * id a request supplied: whoever can choose the id signs in as anybody.
	 *
	 * Sends no e-mail, issues no token, counts nothing in the mail or the
	 * sign-in throttle, and **spends nothing**: links and codes already sent
	 * still work. Proves no e-mail either: `emailVerified` stays as it was.
	 *
	 * An inactive user is `USER_INACTIVE`, as for every sign-in. A malformed
	 * id, an unknown one or one of another type is `NOT_FOUND`, as for `get`:
	 * a sign-in that found nobody is never an answer to read past.
	 *
	 * Given a `device`, answers `newDevice` and `deviceToken`, and sends
	 * `user.newDeviceSignedIn` for a device new to the user. A challenge
	 * carries no device: give it again to `secondFactor.confirm`.
	 */
	signInProven(user: UserRef, options?: SignInOptions): Promise<Answer>;
}
