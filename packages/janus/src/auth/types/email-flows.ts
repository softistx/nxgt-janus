/**
 * What a user type with an e-mail answers besides: a sign-in code, a
 * verification link and, with a password, a reset link.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { PreparedCode, PreparedRequest } from './prepared';
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
		 * Every call issues a new challenge with five attempts of its own, and
		 * spends the earlier ones: only the last code sent works, and a new
		 * `request` is five guesses more. **Throttled per address**, whether
		 * anybody holds it or not: past five requests in 10 minutes
		 * (`janus({ mail: { throttle } })`), `MAIL_THROTTLED` with
		 * `retryAfter`, and no code. Rate-limit it per client too.
		 */
		request(email: string): Promise<IssuedCode<U> | null>;
		/**
		 * `request` in two steps, for an application that sends the code off
		 * the visitor's request: counts the address — `MAIL_THROTTLED` with
		 * `retryAfter` past the limit — looks nobody up, and mints the
		 * `challenge` to give the visitor now, whoever holds the address.
		 * `send()` on the answer does the rest, once.
		 */
		prepare(email: string): Promise<PreparedCode<U>>;
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
		/**
		 * Issues a token for the user's current e-mail. Sending it is yours.
		 * **Throttled per user**: past five in 10 minutes
		 * (`janus({ mail: { throttle } })`), `MAIL_THROTTLED` with
		 * `retryAfter`, and no token.
		 */
		send(user: UserRef): Promise<IssuedToken>;
		/**
		 * Redeems a token and marks the e-mail verified. A token sent to an
		 * e-mail the user has since changed is `TOKEN_STALE`.
		 */
		confirm(token: string): Promise<U>;
		/**
		 * Applies the first proof of the user's e-mail **the application made
		 * itself** — an invitation token it issued to the address and the
		 * person followed: exactly what `magicLink.confirm` and
		 * `signInCode.confirm` do to an e-mail never proved, with no link and
		 * no code. In one write it marks the e-mail verified and drops the
		 * password and the second factor — active or waiting, with its
		 * recovery codes — and it revokes every session and spends the reset
		 * links and second-factor challenges, before the write and after it.
		 * Sends `user.emailVerified`, then `user.passwordChanged` when a
		 * password was dropped and `user.secondFactorDisabled` when an active
		 * factor was. Answers `{ user, proved: true }`.
		 *
		 * An e-mail already proved changes nothing and sends nothing:
		 * `{ user, proved: false }`.
		 *
		 * **Privileged: janus checks no credential.** Call it only after your
		 * server verified its own proof of the inbox, with the user from that
		 * proof's record — never with an id a request supplied: whoever
		 * chooses it drops anybody's password and second factor.
		 *
		 * **Call it before `setPassword` and before `signInProven`**: it drops
		 * the password and revokes every session, so a password set or a
		 * session opened before it is gone after it.
		 *
		 * Counts nothing in the mail or the sign-in throttle, sends no e-mail
		 * and issues no token. An inactive user is `USER_INACTIVE`; a
		 * malformed id, an unknown one or one of another type is `NOT_FOUND`;
		 * a user written between the read and the proof is read again and the
		 * proof retried **once**: `proved: false` when that write proved the
		 * e-mail, `VERSION_CONFLICT` with nothing proved when it changed the
		 * address (the proof you hold is for the address you read) or when
		 * the retry conflicts too, `USER_INACTIVE` when it deactivated the
		 * user. Running the proof twice is harmless.
		 *
		 * **The address you hold is checked.** Given a `User` — an object
		 * carrying the type's e-mail field — it compares that address,
		 * normalised as e-mails are, with the one it reads, on the first read
		 * and on the retry read: a different one is `VERSION_CONFLICT` and
		 * nothing is proved. Given a bare id, or an object without the e-mail
		 * field, it proves the current address.
		 */
		proveFirst(user: UserRef): Promise<FirstProof<U>>;
	};
}

/** What `verifyEmail.proveFirst` answers: the user, and whether this call proved the e-mail. */
export interface FirstProof<U> {
	/** The user after the call: `emailVerified` is `true` either way. */
	readonly user: U;
	/**
	 * `true` when the e-mail had never been proved and this call proved it,
	 * dropping the password and the second factor and revoking every
	 * session; `false` when it was already proved, and nothing changed.
	 */
	readonly proved: boolean;
}

/** What a user type with an e-mail and a password answers besides. */
export interface ResetPasswordApi<U> {
	readonly resetPassword: {
		/**
		 * Issues a reset token for the user of this type holding this e-mail, or
		 * answers `null` when there is none. **Never tell the visitor which**:
		 * answer the same page either way. The user's earlier reset tokens are
		 * spent: only the last one sent works. **Throttled per address**,
		 * whether anybody holds it or not: past five requests in 10 minutes
		 * (`janus({ mail: { throttle } })`), `MAIL_THROTTLED` with
		 * `retryAfter`, and no token.
		 */
		request(
			email: string,
		): Promise<(IssuedToken & { readonly user: U }) | null>;
		/**
		 * `request` in two steps, for an application that sends the link off
		 * the visitor's request: counts the address — `MAIL_THROTTLED` with
		 * `retryAfter` past the limit — and looks nobody up. `send()` on the
		 * answer does the rest, once.
		 */
		prepare(
			email: string,
		): Promise<PreparedRequest<IssuedToken & { readonly user: U }>>;
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
