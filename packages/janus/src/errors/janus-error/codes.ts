/**
 * What this package refuses, as a string a caller can switch on.
 *
 * Every code is a **refusal at call time, on a value that could have come from
 * a request** — which is the rule that decides whether something belongs here
 * or stays a bare `TypeError`. A refusal that can only come from how the
 * application was wired (`janus()` with no schema, a lifespan that is
 * not a duration, a store missing a method) throws a plain `TypeError`
 * instead: no request handler should ever answer one, so no handler needs to
 * tell it apart from the others.
 *
 * The codes are `SCREAMING_SNAKE`, and that is not an exception to this
 * repository's camelCase rule — they are data values, not API identifiers, the
 * same shape `code` has in `@nxgt/mongo` and `@nxgt/redis`. Every *key* in
 * this package is camelCase.
 */
export type JanusErrorCode =
	/**
	 * The store could not answer — a refused connection, a timeout, a primary
	 * stepping down, a deserialisation failure, a bug in the adapter.
	 *
	 * **Never a negative answer.** A handler answers 503 and lets the visitor
	 * retry. Mapping this to a 404, to `null` or to `false` turns an outage
	 * into a silent lockout: every user is told they do not exist.
	 * That failure has been measured twice in this organisation, two days
	 * apart, and it is the reason this package's port is specified rather than
	 * merely documented.
	 */
	| 'STORE_FAILED'
	/**
	 * The store answered, and there is no such record.
	 *
	 * Raised by the `get*` calls, never by the `find*` calls — those return
	 * `null`, which is a value the caller decides what to do with.
	 */
	| 'NOT_FOUND'
	/**
	 * The login — an e-mail, a username — is already held by another user of
	 * the same type.
	 *
	 * Raised by the **store's own unique constraint** and surfaced here, never
	 * decided by reading first: two concurrent sign-ups both pass a read, and
	 * only a constraint refuses one of them. Carries `login` and `userType`.
	 */
	| 'LOGIN_TAKEN'
	/**
	 * The record changed since it was read: the version it was expected to
	 * hold is no longer the version it holds, and **nothing was written**.
	 * Read it again and retry. Carries `expectedVersion` and `actualVersion`.
	 */
	| 'VERSION_CONFLICT'
	/**
	 * The fields failed the user type's schema. Carries `issues`, whose paths
	 * are the fields' own, so a handler can answer 400 field by field.
	 */
	| 'USER_INVALID'
	/**
	 * The password is shorter than the policy's minimum. Reports the policy,
	 * never the password.
	 */
	| 'PASSWORD_TOO_SHORT'
	/**
	 * The login and the password do not match: no such login, no password set,
	 * or the wrong one — **one code for the three**, so a response cannot tell
	 * which accounts exist. `reason` tells them apart for your logs and your
	 * rate limiter, and never belongs in a response body.
	 */
	| 'CREDENTIALS_INVALID'
	/**
	 * A stored hash whose prefix names no wired verifier — typically an import
	 * from a system whose format this core cannot read. Reports the prefix,
	 * never the hash.
	 */
	| 'HASH_UNSUPPORTED'
	/**
	 * The user is inactive: the record and its password are kept, and every
	 * sign-in is refused. Only told to somebody who gave the right password.
	 */
	| 'USER_INACTIVE'
	/** No token holds that secret. */
	| 'TOKEN_UNKNOWN'
	/**
	 * The token was already spent. Told apart from `TOKEN_UNKNOWN` for the
	 * message only — both are refusals, and the outcome is the same.
	 */
	| 'TOKEN_SPENT'
	/**
	 * The token existed and its expiry has passed. It is spent all the same,
	 * so it cannot be retried.
	 */
	| 'TOKEN_EXPIRED'
	/**
	 * The token was sent to an e-mail the user no longer has. Confirming it
	 * would verify an address nobody holds any more, so it is spent and refused.
	 */
	| 'TOKEN_STALE'
	/**
	 * A one-time code that does not match: a wrong TOTP code, or one already
	 * used. Carries `attemptsLeft` when the code was checked against a
	 * challenge: what is left of its attempts, and `0` once the last one spent
	 * it.
	 */
	| 'CODE_INVALID'
	/** `activate` before `enroll`: the user has no second factor waiting. */
	| 'SECOND_FACTOR_NOT_ENROLLED'
	/**
	 * `enroll` or `activate` on a user whose second factor is already active.
	 * `disable` it first: enrolling again must not quietly switch it off.
	 */
	| 'SECOND_FACTOR_ACTIVE'
	/** A cursor this store did not mint, or one written for another ordering.
	 * Never a silent first page: a caller paging a list would loop for ever. */
	| 'INVALID_CURSOR'
	/**
	 * The wired store does not implement the optional capability this call
	 * needs. Names the method and the slot, so the sentence says which store to
	 * change or which call to stop making.
	 */
	| 'UNSUPPORTED'
	/**
	 * A permission check walked deeper than `maxDepth` relations without an
	 * answer. **Not a refusal**: an evaluation that stopped half-way has not
	 * decided anything, and answering `false` would hide a model that is too
	 * deep behind denials nobody can explain. A cycle in the data is not this —
	 * it is cut, silently. Carries `permission` and `maxDepth`.
	 */
	| 'PERMISSION_DEPTH';
