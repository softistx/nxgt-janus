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
 * from every message. Nor a login: a message reports a shape, never a value,
 * and a conflict carries the login in `login`.
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
	readonly slot?: 'users' | 'sessions' | 'tokens' | 'relations';
	/** The permission being checked, in the notation: `record:r1#view`. */
	readonly permission?: string;
	/** The depth a check may walk. */
	readonly maxDepth?: number;
	/** What is left of a challenge's attempts after a code that did not match. */
	readonly attemptsLeft?: number;
	readonly cause?: unknown;
}
