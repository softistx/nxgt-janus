/**
 * What a user type with an e-mail answers besides: moving the user to a new
 * address, by a link sent to it.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { IssuedToken } from './email-flows';
import type { UserRef } from './user';

/**
 * Changing a user's e-mail, proved: a link is sent to the **new** address,
 * and following it moves the user there.
 */
export interface ChangeEmailApi<U> {
	readonly changeEmail: {
		/**
		 * Issues a link's token for the new address `email`. `email` is the
		 * `email` field's value, validated by the type's schema as `update`
		 * would — a malformed one is `USER_INVALID` — and the answer's `email`
		 * is the address to send the link to. Nothing changes until `confirm`.
		 *
		 * **Gate it**: behind a fresh sign-in (`assertFresh`) or a step-up, since
		 * whoever changes the e-mail takes over password resets. Put `token` in
		 * a link to a page of yours, and **only in the e-mail** to the new
		 * address. Tell the former address from `user.emailChanged`.
		 *
		 * Whether somebody already holds the new address is **not** checked here
		 * — it would tell who has an account; `confirm` refuses `LOGIN_TAKEN`.
		 * The user's earlier links are spent: only the last one sent works.
		 * **Throttled** per user and per new address (`janus({ mail: { throttle } })`):
		 * `MAIL_THROTTLED` with `retryAfter`, and no token. An unknown user is
		 * `NOT_FOUND`, an inactive one `USER_INACTIVE`.
		 */
		send(user: UserRef, email: string): Promise<IssuedToken>;
		/**
		 * Spends the link's token, moves the user to the address it was sent to
		 * and marks it verified — the link reached its inbox. Password, second
		 * factor and sessions are untouched. Emits `user.emailChanged` (with
		 * `formerEmail`) and `user.emailVerified`.
		 *
		 * **Call it from a `POST`**, never from the `GET` of the link. An
		 * unknown, spent or lapsed token is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`; a user whose e-mail is no longer the one the link
		 * was asked from is `TOKEN_STALE`; an address another user of the type
		 * holds is `LOGIN_TAKEN` — the token already spent; an inactive user
		 * is `USER_INACTIVE`. A user written in between is `VERSION_CONFLICT`,
		 * also after the token is spent.
		 *
		 * **With several user types**, a token issued to a user of another type
		 * is `TOKEN_UNKNOWN` here, and it is spent. A page that does not know
		 * the type — an anonymous confirmation page — calls the root's
		 * `janus.changeEmail.confirm` instead.
		 */
		confirm(token: string): Promise<U>;
	};
}

/**
 * What an instance with several user types answers at its root when at least
 * one has an e-mail: the confirmation of a change, whatever the user's type.
 */
export interface AnyTypeChangeEmailApi<U> {
	readonly changeEmail: {
		/**
		 * Confirms a change of e-mail for a page that does not know the user's
		 * type: spends the link's token, reads the user it was issued to,
		 * whatever their type, and then does what that type's `confirm` does —
		 * the same move, events and refusals. The answer's `type` says which
		 * type it was.
		 *
		 * **Call it from a `POST`**, never from the `GET` of the link. An
		 * unknown, spent or lapsed token is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`; a user gone since, or of a type with no e-mail, is
		 * `TOKEN_UNKNOWN`; a user whose e-mail is no longer the one the link
		 * was asked from is `TOKEN_STALE`; an address another user of the type
		 * holds is `LOGIN_TAKEN` — the token already spent; an inactive user
		 * is `USER_INACTIVE`. A user written in between is `VERSION_CONFLICT`.
		 *
		 * `send` stays on each type: `janus.admin.changeEmail.send(...)`.
		 */
		confirm(token: string): Promise<U>;
	};
}
