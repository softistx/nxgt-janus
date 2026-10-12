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
		 */
		confirm(token: string): Promise<U>;
	};
}
