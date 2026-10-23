/**
 * What an instance with several user types answers at its root for a reset
 * link: the confirmation, whatever the user's type.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

/**
 * What an instance with several user types answers at its root when at least
 * one has a password and an e-mail: the confirmation of a reset link, whatever
 * the user's type.
 */
export interface AnyTypeResetPasswordApi<U> {
	readonly resetPassword: {
		/**
		 * Resets a password for a page that does not know the user's type:
		 * spends the link's token, reads the user it was issued to, whatever
		 * their type, and then does what that type's `confirm` does — sets the
		 * password, marks the e-mail verified, signs the user out everywhere,
		 * with the same events and refusals. The answer's `type` says which
		 * type it was.
		 *
		 * **The password must meet the strictest `minLength`** among the types
		 * with a password, and it is checked **before** the token is spent, so
		 * a refused password never costs the visitor their link: the type is
		 * only known once the token is spent. A password type with no e-mail
		 * counts too, since the root cannot tell: it can never be reset, but
		 * its rule still applies at the root. A type with a more lenient rule
		 * sees the stricter one at the root only; its own `confirm` applies
		 * its own. The two are the same when every type has the same
		 * `minLength`. `PASSWORD_TOO_SHORT` at the root reports that strictest
		 * `minLength`, and the `userType` that set it.
		 *
		 * **Call it from a `POST`**, never from the `GET` of the link. An
		 * unknown, spent or lapsed token is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`; a user gone since, or of a type with no password
		 * or no e-mail, is `TOKEN_UNKNOWN`; a user whose e-mail is no longer
		 * the one the link was sent to is `TOKEN_STALE`. A user written in
		 * between is `VERSION_CONFLICT`.
		 *
		 * `request` and `prepare` stay on each type:
		 * `janus.admin.resetPassword.request(...)`.
		 */
		confirm(token: string, password: string): Promise<U>;
	};
}
