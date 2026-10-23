/**
 * What an instance with several user types answers at its root for a
 * verification link: the confirmation, whatever the user's type.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

/**
 * What an instance with several user types answers at its root when at least
 * one has an e-mail: the confirmation of a verification link, whatever the
 * user's type.
 */
export interface AnyTypeVerifyEmailApi<U> {
	readonly verifyEmail: {
		/**
		 * Confirms an e-mail for a page that does not know the user's type:
		 * spends the link's token, reads the user it was issued to, whatever
		 * their type, and then does what that type's `confirm` does — the same
		 * write, events and refusals. The answer's `type` says which type it
		 * was.
		 *
		 * **Call it from a `POST`**, never from the `GET` of the link. An
		 * unknown, spent or lapsed token is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`; a user gone since, or of a type with no e-mail, is
		 * `TOKEN_UNKNOWN`; a user whose e-mail is no longer the one the link
		 * was sent to is `TOKEN_STALE`. A user written in between is
		 * `VERSION_CONFLICT`.
		 *
		 * `send` and `proveFirst` stay on each type:
		 * `janus.admin.verifyEmail.send(...)`.
		 */
		confirm(token: string): Promise<U>;
	};
}
