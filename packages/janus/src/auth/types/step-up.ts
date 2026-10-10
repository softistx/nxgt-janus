/**
 * What a user type with an e-mail answers besides: a step-up — a signed-in
 * user proving again who they are before a sensitive action.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { RequestLike, Session } from './session';
import type { UserRef } from './user';

/** A step-up confirmed by a code sent by e-mail: send `code`, keep `challenge`. */
export interface StepUpByEmail<U> {
	readonly via: 'email';
	/** Six digits, for the user to type. Put it in the e-mail, and nowhere else. */
	readonly code: string;
	/**
	 * The secret the code is checked against. **Keep it with the user** — the
	 * confirmation form's body, a short-lived cookie — never in the e-mail, a
	 * URL or a log.
	 */
	readonly challenge: string;
	/** The address to send the code to. */
	readonly email: string;
	readonly expiresAt: Date;
	readonly user: U;
}

/**
 * A step-up confirmed by a code from the user's authenticator app, since
 * their second factor is active: **nothing to send** — ask for the app's
 * code, and keep `challenge`.
 */
export interface StepUpByApp<U> {
	readonly via: 'secondFactor';
	/** The secret the app's code is confirmed with. Keep it as for an e-mail. */
	readonly challenge: string;
	readonly expiresAt: Date;
	readonly user: U;
}

/**
 * What a user type with an e-mail answers besides: a **step-up**, which a
 * route asks for before something a stolen session should not do alone —
 * changing the e-mail, disabling the second factor, deleting the account.
 *
 * `Issued` is {@link StepUpByEmail} alone, or with {@link StepUpByApp} when
 * the type may have a second factor: a user whose factor is active confirms
 * with their app, never by e-mail, so a step-up is never weaker than the
 * sign-in their account asks for.
 */
export interface StepUpApi<U, Issued = StepUpByEmail<U>> {
	readonly stepUp: {
		/**
		 * Issues a challenge for the user: with a six-digit code to e-mail
		 * (`via: 'email'`), or, when their second factor is active, to
		 * confirm with a code from their app (`via: 'secondFactor'`). **One
		 * step-up is live per user**: the ones issued before stop working.
		 *
		 * `NOT_FOUND` for no such user of this type, or one with no e-mail;
		 * `USER_INACTIVE` for an inactive one. A code to e-mail is **throttled
		 * per user**: past five in 10 minutes (`janus({ mail: { throttle } })`),
		 * `MAIL_THROTTLED` with `retryAfter`, and no challenge. A challenge for
		 * the app sends nothing, and is not counted.
		 */
		request(user: UserRef): Promise<Issued>;
		/**
		 * Checks the code against its challenge and **marks the session the
		 * request presents as freshly confirmed**: its `authenticatedAt` moves
		 * to now, and the session is answered. What a route then checks is
		 * `session.authenticatedAt` — `assertFresh(session, '10m')`.
		 *
		 * A challenge takes **five attempts**: a code that does not match is
		 * `CODE_INVALID` with `attemptsLeft`, and the fifth spends it. An
		 * app's codes are also counted per user, five per 15-minute window,
		 * shared with `regenerateRecoveryCodes`. An unknown, spent or lapsed
		 * challenge is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or `TOKEN_EXPIRED` — and
		 * so is a request whose session is not a standing one of the user the
		 * challenge is for. An e-mail the user changed since is `TOKEN_STALE`;
		 * a second factor activated since an e-mailed code is
		 * `SECOND_FACTOR_ACTIVE`, and one removed since an app's challenge
		 * `SECOND_FACTOR_NOT_ENROLLED`; an inactive user is `USER_INACTIVE`.
		 */
		confirm(
			request: RequestLike,
			challenge: string,
			code: string,
		): Promise<Session>;
	};
}
