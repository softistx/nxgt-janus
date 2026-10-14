/**
 * What a user type with a login or an e-mail answers besides: finding its
 * user by that key, or creating it when nobody holds it.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

/**
 * Finding a user by the key an invitation names, or creating them — the
 * accept step of an invitation, without the race between the read and the
 * write.
 */
export interface FindOrCreateApi<U, In> {
	/**
	 * The user of this type holding `key`, or the user `input()` describes,
	 * created. Answers `{ user, created }`.
	 *
	 * The key is looked up as the type's own lookup would: the login, normalised
	 * as `findByLogin` normalises it, on a type that signs in with a password;
	 * the e-mail, normalised as `findByEmail` normalises it, on a type that does
	 * not. A user found, an inactive one included, is answered
	 * `{ user, created: false }`: `input` is not called and nothing is written.
	 *
	 * When nobody holds the key, `input` is called (it may be async) and the
	 * user is created exactly as `create` creates one. **What `input` throws
	 * propagates and nothing is written** — that is how the caller refuses before
	 * any write, such as "a password is required". The input must name the same
	 * key: once validated, its login (its e-mail, on a type with no password)
	 * must equal the normalised `key`, or the call is refused with
	 * `USER_INVALID` before the write.
	 *
	 * A call that loses a race to another that creates the same user gets the
	 * `LOGIN_TAKEN` of the store, reads the key once more and answers the
	 * winner `{ user, created: false }`; the `LOGIN_TAKEN` is rethrown only
	 * when that read finds nobody — another login of the new user is taken.
	 *
	 * On a type whose login is a username, an e-mail key finds an existing user
	 * (e-mails are stored as logins) but can never create one: the input's
	 * username is not the key, so it is `USER_INVALID`.
	 *
	 * **An account-existence oracle, as `findByEmail` is: never expose it to an
	 * anonymous client.** A key that is no storable string is nobody's, and goes
	 * through `input` and the creation, which refuses it.
	 *
	 * Rejects with `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN`, or
	 * `STORE_FAILED`, and with whatever `input` throws. Sends `user.created`
	 * only when it created.
	 */
	findOrCreate(
		key: string,
		input: () =>
			| (In & { readonly password?: string; readonly active?: boolean })
			| Promise<In & { readonly password?: string; readonly active?: boolean }>,
	): Promise<{ readonly user: U; readonly created: boolean }>;
}
