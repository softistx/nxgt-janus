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
	 * into a silent lockout: everybody who has an account is told they do not.
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
	/** A cursor this store did not mint, or one written for another ordering.
	 * Never a silent first page: a caller paging a list would loop for ever. */
	| 'INVALID_CURSOR'
	/**
	 * The wired store does not implement the optional capability this call
	 * needs. Names the method and the slot, so the sentence says which store to
	 * change or which call to stop making.
	 */
	| 'UNSUPPORTED';

/** One thing that was wrong with a user's fields, at one path. */
export interface Issue {
	/** The path inside the fields, as the schema reported it: `['address', 'city']`. */
	readonly path: readonly (string | number)[];
	readonly message: string;
}

/**
 * Why a sign-in was refused, for your logs and rate limiter.
 *
 * **Never put it in a response body.** `unknownLogin` is an account
 * enumeration oracle.
 */
export type CredentialRefusal = 'unknownLogin' | 'noPassword' | 'wrongPassword';

/**
 * What an error may carry beside its code.
 *
 * **No field here ever holds a secret.** Not a password, not a hash, not a
 * session token, not a token secret, not a token's hash, and not a connection
 * URI — a connection string holds a password, and the specs assert its absence
 * from every message. A `login` may appear, because the caller just sent it.
 */
export interface JanusErrorOptions {
	readonly userId?: string;
	readonly userType?: string;
	/** The login a conflict names: an address, never a secret. */
	readonly login?: string;
	readonly reason?: CredentialRefusal;
	/** The prefix of a hash whose format is unknown. Never the hash. */
	readonly hashPrefix?: string;
	readonly expectedVersion?: number;
	readonly actualVersion?: number;
	readonly issues?: readonly Issue[];
	/** The minimum the policy requires. Never the password that failed it. */
	readonly minLength?: number;
	/** The port method being called: `insertUser`, `consumeToken`. */
	readonly operation?: string;
	/** Which store slot: the sentence should say which store to change. */
	readonly slot?: 'users' | 'sessions' | 'tokens';
	readonly cause?: unknown;
}

/**
 * The base of everything this package throws at call time.
 *
 * It extends `Error` and not `TypeError`, and the rule behind that is
 * `nxgt-data`'s: *extend whichever class the refusals it replaces already
 * threw, so no consumer's `catch` stops working*. These replace nothing — the
 * package is new — and `DataError`, `RedisError` and `S3Error` all extend
 * `Error`, so nobody has to order their `catch` blocks.
 *
 * **There is exactly one definition of this class**, and that matters more here
 * than it looks: an adapter in another package throws `StoreFailure` and this
 * package tests it with `instanceof`. Two copies and the product is wrong about
 * what an outage is. `build.ts` shares the module across entry points with
 * `splitting: true`, and `scripts/verify-artifacts.ts` fails the build if any
 * class name appears in two entry bundles of the packed tarball.
 */
export class JanusError extends Error {
	override name = 'JanusError';
	readonly code: JanusErrorCode = 'STORE_FAILED';
	readonly userId: string | undefined;
	readonly userType: string | undefined;
	readonly login: string | undefined;
	readonly reason: CredentialRefusal | undefined;
	readonly hashPrefix: string | undefined;
	readonly expectedVersion: number | undefined;
	readonly actualVersion: number | undefined;
	readonly issues: readonly Issue[] | undefined;
	readonly minLength: number | undefined;
	readonly operation: string | undefined;
	readonly slot: 'users' | 'sessions' | 'tokens' | undefined;

	constructor(message: string, options?: JanusErrorOptions) {
		super(message, { cause: options?.cause });
		this.userId = options?.userId;
		this.userType = options?.userType;
		this.login = options?.login;
		this.reason = options?.reason;
		this.hashPrefix = options?.hashPrefix;
		this.expectedVersion = options?.expectedVersion;
		this.actualVersion = options?.actualVersion;
		this.issues = options?.issues;
		this.minLength = options?.minLength;
		this.operation = options?.operation;
		this.slot = options?.slot;
	}
}

/**
 * The store could not answer.
 *
 * **This is the class an adapter throws**, and it is exported for that reason:
 * an adapter defines no error class of its own, so `instanceof` holds across
 * the two packages. Any other throw from a store is treated as a failure too —
 * throwing this one is how an adapter says so precisely, and sets `cause`.
 */
export class StoreFailure extends JanusError {
	override name = 'StoreFailure';
	override readonly code = 'STORE_FAILED' as const;
}

/**
 * A uniqueness or a version constraint the store refused.
 *
 * Also thrown by an adapter, and also for the `instanceof` reason. `on` says
 * which constraint, because the two are answered differently: a login
 * collision is the caller's to fix, a version conflict is a retry.
 */
export class StoreConflict extends JanusError {
	override name = 'StoreConflict';
	override readonly code: JanusErrorCode;
	readonly on: 'login' | 'version';

	constructor(
		on: 'login' | 'version',
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.on = on;
		this.code = on === 'login' ? 'LOGIN_TAKEN' : 'VERSION_CONFLICT';
	}
}

/** There is no such record, and the store said so. */
export class NotFoundError extends JanusError {
	override name = 'NotFoundError';
	override readonly code = 'NOT_FOUND' as const;
}

/** The fields failed the user type's schema. */
export class UserInvalidError extends JanusError {
	override name = 'UserInvalidError';
	override readonly code = 'USER_INVALID' as const;
}

/** A password too short, credentials that do not match, or a hash format nobody reads. */
export class CredentialError extends JanusError {
	override name = 'CredentialError';
	override readonly code: JanusErrorCode;

	constructor(
		code: Extract<
			JanusErrorCode,
			'PASSWORD_TOO_SHORT' | 'CREDENTIALS_INVALID' | 'HASH_UNSUPPORTED'
		>,
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.code = code;
	}
}

/** The user is inactive, and the password given was the right one. */
export class UserInactiveError extends JanusError {
	override name = 'UserInactiveError';
	override readonly code = 'USER_INACTIVE' as const;
}

/** A one-time token that is unknown, already spent, lapsed, or sent to an e-mail the user no longer has. */
export class TokenError extends JanusError {
	override name = 'TokenError';
	override readonly code: JanusErrorCode;

	constructor(
		code: Extract<
			JanusErrorCode,
			'TOKEN_UNKNOWN' | 'TOKEN_SPENT' | 'TOKEN_EXPIRED' | 'TOKEN_STALE'
		>,
		message: string,
		options?: JanusErrorOptions,
	) {
		super(message, options);
		this.code = code;
	}
}

/** A cursor this store did not mint, or one for another ordering. */
export class InvalidCursorError extends JanusError {
	override name = 'InvalidCursorError';
	override readonly code = 'INVALID_CURSOR' as const;
}

/** The wired store does not implement the optional capability asked for. */
export class UnsupportedError extends JanusError {
	override name = 'UnsupportedError';
	override readonly code = 'UNSUPPORTED' as const;
}
