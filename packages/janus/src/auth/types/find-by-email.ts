/**
 * What a user type with an e-mail answers besides: finding its user by the
 * address, whether the type signs in with a password or not.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

/**
 * Finding a user by their e-mail — the lookup an invitation needs before
 * `signInProven`, on a type with no password and so no `findByLogin`.
 */
export interface FindByEmailApi<U> {
	/**
	 * The user of this type holding this e-mail, or `null`. The address is
	 * normalised as the e-mail flows normalise it — trimmed and lowercased —
	 * whatever the type's login, so a type signing in with a username is
	 * still found by its e-mail, and a username that only looks like an
	 * address is nobody's. An inactive user is answered too, as by `find`.
	 *
	 * **An account-existence oracle: never expose it to an anonymous
	 * client.** It is a server-side read, to call after a proof of your own —
	 * an invitation token your server issued. It counts nothing in the mail
	 * or the sign-in throttle, issues nothing and writes nothing.
	 *
	 * A value that is no address — not a string, empty once trimmed, or
	 * holding a NUL or a lone surrogate — is nobody's: `null`, without
	 * asking the store, as `find` answers a malformed id. Rejects with
	 * `STORE_FAILED` only.
	 */
	findByEmail(email: string): Promise<U | null>;
}
