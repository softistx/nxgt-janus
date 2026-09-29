/**
 * What a user type with an e-mail answers besides: a sign-in code, a
 * verification link and, with a password, a reset link.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { SignedIn, SignInOptions, SignInResult } from './sign-in';
import type { UserRef } from './user';

/** A one-time token, given to the application once, to send by e-mail. */
export interface IssuedToken {
	readonly token: string;
	/** The address to send it to. */
	readonly email: string;
	readonly expiresAt: Date;
}

/** An e-mailed sign-in code: send `code`, keep `challenge` for the confirmation. */
export interface IssuedCode<U> {
	/** Six digits, for the visitor to type. Put it in the e-mail, and nowhere else. */
	readonly code: string;
	/**
	 * The secret the code is checked against. **Keep it with the visitor** —
	 * a short-lived cookie, or the code form's body — never in the e-mail,
	 * a URL or a log.
	 */
	readonly challenge: string;
	/** The address to send the code to. */
	readonly email: string;
	readonly expiresAt: Date;
	readonly user: U;
}

/**
 * What a user type with an e-mail answers besides: signing in with a code
 * sent to it, no password needed.
 *
 * `Answer` is {@link SignInResult} when the type may have a second factor:
 * the code proves the e-mail, and an active factor is still asked for.
 */
export interface SignInCodeApi<U, Answer = SignedIn<U>> {
	readonly signInCode: {
		/**
		 * Issues a code for the user of this type holding this e-mail, or
		 * answers `null` when there is none, or they are inactive. **Never tell
		 * the visitor which**: answer the same page either way, and in the same
		 * time — send the e-mail off the request's path.
		 *
		 * **Rate-limit it, per e-mail and per client.** Every call issues a new
		 * challenge with five attempts of its own, and spends the earlier ones:
		 * only the last code sent works, and a new `request` is five guesses
		 * more — the five attempts bound one challenge, not one account.
		 */
		request(email: string): Promise<IssuedCode<U> | null>;
		/**
		 * Checks the code against its challenge, marks the e-mail verified —
		 * the code reached the inbox — and signs the user in. **An e-mail
		 * proved for the first time drops the password and the second factor,
		 * and signs out every session** before the new one opens, as for a
		 * link. An e-mail already verified changes nothing.
		 *
		 * A challenge takes **five attempts**: a code that does not match is
		 * `CODE_INVALID` with `attemptsLeft`, and the fifth spends it. An
		 * unknown, spent or lapsed challenge is `TOKEN_UNKNOWN`, `TOKEN_SPENT`
		 * or `TOKEN_EXPIRED`; an e-mail the user changed since is `TOKEN_STALE`;
		 * an inactive user is `USER_INACTIVE`.
		 */
		confirm(
			challenge: string,
			code: string,
			options?: SignInOptions,
		): Promise<Answer>;
	};
}

/** What a user type with an e-mail answers besides. */
export interface VerifyEmailApi<U> {
	readonly verifyEmail: {
		/** Issues a token for the user's current e-mail. Sending it is yours. */
		send(user: UserRef): Promise<IssuedToken>;
		/**
		 * Redeems a token and marks the e-mail verified. A token sent to an
		 * e-mail the user has since changed is `TOKEN_STALE`.
		 */
		confirm(token: string): Promise<U>;
	};
}

/** What a user type with an e-mail and a password answers besides. */
export interface ResetPasswordApi<U> {
	readonly resetPassword: {
		/**
		 * Issues a reset token for the user of this type holding this e-mail, or
		 * answers `null` when there is none. **Never tell the visitor which**:
		 * answer the same page either way. The user's earlier reset tokens are
		 * spent: only the last one sent works.
		 */
		request(
			email: string,
		): Promise<(IssuedToken & { readonly user: U }) | null>;
		/**
		 * Redeems the token, sets the password, marks the e-mail verified — the
		 * link proved it — and **signs the user out everywhere**. Every other
		 * reset token of the user is spent, as by `changePassword` and
		 * `setPassword`. Opens no session: call `signIn` next if that is your
		 * policy.
		 */
		confirm(token: string, password: string): Promise<U>;
	};
}
