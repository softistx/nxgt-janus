/**
 * What `janus()` hands back, typed from the configuration it was given.
 *
 * The generic form lives here; the implementation works on a degenericised
 * mirror and casts once, in `janus.ts`. That is `nxgt-data`'s shape, and it
 * keeps each schema's type travelling through every public method without
 * dragging a type parameter through every internal function.
 */

import type { Id } from '../ids/id';
import type { CursorPage } from '../pagination/cursor-page';
import type {
	JanusConfig,
	MultiTypeConfig,
	RESERVED_FIELDS,
	RESERVED_TYPES,
	SingleTypeConfig,
	UserSchema,
} from './config';
import type { SessionRecord } from './port/types';
import type { StandardSchemaV1 } from './standard-schema';

/** What every user carries beside the application's own fields. */
export interface UserBase<Type extends string = string> {
	readonly id: Id;
	/** Which user type — `'patient'`, `'staff'`, or `'user'` in the one-type form. */
	readonly type: Type;
	/** Whether the user proved they hold their current e-mail. */
	readonly emailVerified: boolean;
	/** `false`: the user is kept, and every sign-in is refused. */
	readonly active: boolean;
	/**
	 * Whether a password is set. **The hash itself never reaches a user**: no
	 * type that reaches a request handler carries it, and `test/types/` pins
	 * that.
	 */
	readonly hasPassword: boolean;
	/**
	 * Whether a second factor is **active**: enrolled, and proved with a first
	 * code. A factor still waiting for that code does not count, and `signIn`
	 * does not ask for it.
	 */
	readonly hasSecondFactor: boolean;
	/** One more on every write: what `ifVersion` is compared against. */
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** A user as application code sees it: their fields, at the top level, and {@link UserBase}. */
export type User<
	Type extends string = string,
	Fields = object,
> = Readonly<Fields> & UserBase<Type>;

/** A user, or their id: every method that takes one takes either. */
export type UserRef = string | { readonly id: string };

/** A session, as application code sees it: everything but the token's hash. */
export type Session = Omit<SessionRecord, 'tokenHash'>;

/**
 * A session just opened. **The token is here and nowhere else**: the store
 * holds its hash. Put it in a cookie with `auth.cookie.serialize`, or hand it
 * to a client that sends it as `Authorization: Bearer`.
 */
export interface SignedIn<U> {
	readonly status: 'signedIn';
	readonly user: U;
	readonly session: Session;
	readonly token: string;
}

/**
 * The password was right, and the user has a second factor: no session yet.
 * Ask for a code, then call `secondFactor.confirm(challenge, code)`.
 *
 * **The challenge is a secret** like a session token: keep it where the
 * visitor's next request can present it — a short-lived cookie, or the body
 * of your code form — and never in a URL or a log.
 */
export interface SecondFactorRequired {
	readonly status: 'secondFactor';
	readonly challenge: string;
	/** When the challenge lapses. Five minutes after `signIn`, by default. */
	readonly expiresAt: Date;
	/**
	 * Whose sign-in waits for its code — for your logs and your rate limits.
	 * **Not for the visitor**: they have proved a password or an e-mail, not
	 * yet who they are, so answer them the challenge alone.
	 */
	readonly userId: Id;
}

/** What `signIn` answers once a second factor is configured: switch on `status`. */
export type SignInResult<U> = SignedIn<U> | SecondFactorRequired;

/** What `secondFactor.enroll` answers: show both, keep neither. */
export interface SecondFactorEnrolment {
	/** The TOTP secret, in base32: for a user who types it in instead of scanning. */
	readonly secret: string;
	/** The `otpauth://` URI to render as a QR code. */
	readonly uri: string;
}

/** Who a request belongs to. */
export interface Authenticated<U> {
	readonly user: U;
	readonly session: Session;
	/** The token the request presented. */
	readonly token: string;
	/**
	 * Whether this call renewed the session. When it did, `session.expiresAt`
	 * moved: send the cookie again with `auth.cookie.serialize(token, session)`.
	 */
	readonly renewed: boolean;
}

/** A one-time token, given to the application once, to send by e-mail. */
export interface IssuedToken {
	readonly token: string;
	/** The address to send it to. */
	readonly email: string;
	readonly expiresAt: Date;
}

/** What `authenticate` and `signOut` read a session token from. */
export type RequestLike =
	| Request
	| Headers
	| { readonly headers: Headers | HeaderRecord }
	| HeaderRecord;

/** Headers as Node's `IncomingMessage` and most frameworks hold them. */
export type HeaderRecord = {
	readonly [name: string]: string | readonly string[] | undefined;
};

/** Options every write that follows a read may take. */
export interface WriteOptions {
	/**
	 * The version the user must still hold, as read. A write to a user who
	 * changed since is `VERSION_CONFLICT`, and nothing is written.
	 */
	readonly ifVersion?: number;
}

// ─── From a configuration to its types ────────────────────────────────────

type OutputOf<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: never;
type InputOf<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferInput<S>
	: never;

/** The single-type form, seen as one entry of `users`. */
type SingleAsType<C extends SingleTypeConfig> = {
	readonly schema: C['user'];
	readonly password: C['password'];
	readonly email: C['email'];
};

/** Every user type a configuration declares, by name. */
export type TypesOf<C> = C extends MultiTypeConfig
	? C['users']
	: C extends SingleTypeConfig
		? { readonly user: SingleAsType<C> }
		: never;

/**
 * Every **top-level, required** key of `T` whose value is a string: what a
 * login or an e-mail may name. Required, because a login read from an
 * optional field is a user who may have no way to sign in.
 */
export type RequiredStringKeys<T> = {
	[K in keyof T & string]-?: object extends Pick<T, K>
		? never
		: T[K] extends string
			? K
			: never;
}[keyof T & string];

/** The login field of one user type, or `never` without a password. */
export type LoginOf<Def> = Def extends {
	readonly password: { readonly login: infer L extends string };
}
	? L
	: never;

/**
 * The e-mail field of one user type: the one it names, or `'email'` when the
 * schema has a required string `email` — or `never`, and then the e-mail flows
 * do not exist on it.
 */
export type EmailOf<Def> = Def extends {
	readonly email: infer E extends string;
}
	? E
	: Def extends { readonly schema: infer S }
		? 'email' extends RequiredStringKeys<OutputOf<S>>
			? 'email'
			: never
		: never;

type UserOfType<Name extends string, Def> = Def extends {
	readonly schema: infer S;
}
	? User<Name, OutputOf<S>>
	: never;

/** Every user of a configuration: a union discriminated by `type`. */
export type UserOf<C> = {
	[K in keyof TypesOf<C> & string]: UserOfType<K, TypesOf<C>[K]>;
}[keyof TypesOf<C> & string];

/** What `create`, `signUp` and `update` take for one user type. */
type FieldsInput<Def> = Def extends { readonly schema: infer S }
	? InputOf<S>
	: never;

// ─── The surface ──────────────────────────────────────────────────────────

/** What every user type answers. */
export interface UserTypeApi<U, In> {
	/**
	 * Creates a user without signing them in — for an import, an admin screen,
	 * an invitation. Validates the fields, and hashes the password when one is
	 * given.
	 *
	 * Rejects with `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN`, or
	 * `STORE_FAILED`.
	 */
	create(
		input: In & { readonly password?: string; readonly active?: boolean },
	): Promise<U>;

	/** The user of this type, or `null` — for a malformed id, an unknown one, or one of another type. */
	find(id: string): Promise<U | null>;

	/** The user of this type, or `NOT_FOUND`. */
	get(id: string): Promise<U>;

	/** One page of users of this type, in creation order. A cursor this package did not mint is `INVALID_CURSOR`. */
	list(page?: {
		readonly after?: string | null;
		readonly limit?: number;
	}): Promise<CursorPage<U>>;

	/**
	 * Changes some fields and keeps the others: the patch is merged over the
	 * stored fields, then **the whole result is validated**. Changing the e-mail
	 * sets `emailVerified` back to `false`.
	 */
	update(user: UserRef, patch: Partial<In>, options?: WriteOptions): Promise<U>;

	/** Activates or deactivates. An inactive user's sessions stop authenticating. */
	setActive(user: UserRef, active: boolean, options?: WriteOptions): Promise<U>;

	/**
	 * Deletes the user, **with every session and one-time token they had** —
	 * nothing of theirs is kept, the e-mail a token was sent to included.
	 * `true` when this call deleted them; `false` for a malformed id, an
	 * unknown one, or one of another type, which is left untouched.
	 *
	 * With `relations` wired into `janus()`, every tuple naming the user goes
	 * too, last.
	 *
	 * Idempotent: an outage half-way leaves sessions, tokens and tuples that
	 * name somebody who no longer exists, and calling it again deletes them.
	 */
	delete(user: UserRef): Promise<boolean>;
}

/**
 * What a user type that signs in with a password answers besides.
 *
 * `Answer` is what `signIn` answers: {@link SignedIn}, or {@link SignInResult}
 * once `janus()` is given a `secondFactor`.
 */
export interface PasswordApi<
	U,
	In,
	Login extends string,
	Answer = SignedIn<U>,
> {
	/**
	 * Creates the user and signs them in.
	 *
	 * Rejects with `USER_INVALID`, `PASSWORD_TOO_SHORT`, `LOGIN_TAKEN`, or
	 * `STORE_FAILED`.
	 */
	signUp(input: In & { readonly password: string }): Promise<SignedIn<U>>;

	/**
	 * Checks the password and opens a session.
	 *
	 * Rejects with `CREDENTIALS_INVALID` — one code for an unknown login, a user
	 * with no password and a wrong password, so a response cannot tell which
	 * accounts exist; `reason` tells them apart for your logs. When nobody holds
	 * the login, a dummy hash is still compared, so the time taken does not say
	 * so either. **The store's own latency stays observable**, and that limit is
	 * documented rather than denied. An inactive user who gave the right
	 * password is `USER_INACTIVE`.
	 *
	 * With a `secondFactor` configured, a user whose factor is active gets no
	 * session yet: `{ status: 'secondFactor', challenge }`, for
	 * `secondFactor.confirm`. Switch on `status`.
	 */
	signIn(
		input: { readonly [K in Login]: string } & { readonly password: string },
	): Promise<Answer>;

	/** The user holding this login, normalised as sign-up normalised it, or `null`. */
	findByLogin(login: string): Promise<U | null>;

	/** Sets or replaces the password — an admin's call. `PASSWORD_TOO_SHORT` below the policy. */
	setPassword(
		user: UserRef,
		password: string,
		options?: WriteOptions,
	): Promise<U>;

	/**
	 * Replaces the password after checking the current one — the user's call.
	 * `CREDENTIALS_INVALID` when `current` is wrong. Other sessions stay open:
	 * call `signOutEverywhere(user, { except })` for that.
	 */
	changePassword(
		user: UserRef,
		change: { readonly current: string; readonly next: string },
		options?: WriteOptions,
	): Promise<U>;
}

/**
 * What a user type with a password answers besides, once `janus()` is given a
 * `secondFactor`: a TOTP second factor, from the first QR code to the code
 * `signIn` asks for.
 *
 * A factor is **enrolled** by `enroll`, **active** once `activate` accepted a
 * first code, and gone after `disable`. Only an active one is asked for.
 */
export interface SecondFactorApi<U> {
	readonly secondFactor: {
		/**
		 * Mints a TOTP secret, seals it onto the user, and answers it with the
		 * URI to show as a QR code. The factor waits for `activate`; a factor
		 * already waiting is replaced. `SECOND_FACTOR_ACTIVE` when one is active.
		 */
		enroll(
			user: UserRef,
			options?: WriteOptions,
		): Promise<SecondFactorEnrolment>;
		/**
		 * Checks a first code from the app, and makes the factor active: from
		 * then on `signIn` asks for a code. `CODE_INVALID` when it does not match,
		 * `SECOND_FACTOR_NOT_ENROLLED` before `enroll`.
		 */
		activate(user: UserRef, code: string, options?: WriteOptions): Promise<U>;
		/** Removes the factor, active or waiting. A user without one is answered as is. */
		disable(user: UserRef, options?: WriteOptions): Promise<U>;
		/**
		 * Redeems `signIn`'s challenge with a code, and opens the session.
		 *
		 * A challenge takes **five attempts**: a code that does not match is
		 * `CODE_INVALID` with `attemptsLeft`, and the fifth spends the challenge.
		 * A code is accepted once, so a replay is `CODE_INVALID` too. An unknown,
		 * spent or lapsed challenge is `TOKEN_UNKNOWN`, `TOKEN_SPENT` or
		 * `TOKEN_EXPIRED`: sign in again.
		 */
		confirm(challenge: string, code: string): Promise<SignedIn<U>>;
	};
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
		 * **Rate-limit it, per e-mail and per client.** Every call issues a new
		 * challenge with five attempts of its own, and the earlier ones stay
		 * valid until they lapse: the five attempts bound one challenge, not
		 * one account.
		 */
		request(email: string): Promise<IssuedCode<U> | null>;
		/**
		 * Checks the code against its challenge, marks the e-mail verified —
		 * the code reached the inbox — and signs the user in.
		 *
		 * A challenge takes **five attempts**: a code that does not match is
		 * `CODE_INVALID` with `attemptsLeft`, and the fifth spends it. An
		 * unknown, spent or lapsed challenge is `TOKEN_UNKNOWN`, `TOKEN_SPENT`
		 * or `TOKEN_EXPIRED`; an e-mail the user changed since is `TOKEN_STALE`;
		 * an inactive user is `USER_INACTIVE`.
		 */
		confirm(challenge: string, code: string): Promise<Answer>;
	};
}

/** What a user type with an e-mail answers besides. */
export interface VerifyEmailApi<U> {
	readonly verifyEmail: {
		/** Issues a token for the user's current e-mail. Sending it is yours. */
		send(user: UserRef): Promise<IssuedToken>;
		/**
		 * Redeems a token and marks the e-mail verified. A token sent to an
		 * e-mail the user has since changed is `TOKEN_STALE`.
		 */
		confirm(token: string): Promise<U>;
	};
}

/** What a user type with an e-mail and a password answers besides. */
export interface ResetPasswordApi<U> {
	readonly resetPassword: {
		/**
		 * Issues a reset token for the user of this type holding this e-mail, or
		 * answers `null` when there is none. **Never tell the visitor which**:
		 * answer the same page either way.
		 */
		request(
			email: string,
		): Promise<(IssuedToken & { readonly user: U }) | null>;
		/**
		 * Redeems the token, sets the password, marks the e-mail verified — the
		 * link proved it — and **signs the user out everywhere**. Opens no
		 * session: call `signIn` next if that is your policy.
		 */
		confirm(token: string, password: string): Promise<U>;
	};
}

/**
 * The whole surface of one user type, with only the flows its configuration
 * allows. `TwoFactor` is whether `janus()` was given a `secondFactor`.
 */
export type TypeApi<
	Name extends string,
	Def,
	TwoFactor extends boolean = false,
> = UserTypeApi<UserOfType<Name, Def>, FieldsInput<Def>> &
	([LoginOf<Def>] extends [never]
		? unknown
		: TwoFactor extends true
			? PasswordApi<
					UserOfType<Name, Def>,
					FieldsInput<Def>,
					LoginOf<Def>,
					SignInResult<UserOfType<Name, Def>>
				> &
					SecondFactorApi<UserOfType<Name, Def>>
			: PasswordApi<UserOfType<Name, Def>, FieldsInput<Def>, LoginOf<Def>>) &
	([EmailOf<Def>] extends [never]
		? unknown
		: VerifyEmailApi<UserOfType<Name, Def>> &
				SignInCodeApi<
					UserOfType<Name, Def>,
					TwoFactor extends true
						? [LoginOf<Def>] extends [never]
							? SignedIn<UserOfType<Name, Def>>
							: SignInResult<UserOfType<Name, Def>>
						: SignedIn<UserOfType<Name, Def>>
				>) &
	([LoginOf<Def>] extends [never]
		? unknown
		: [EmailOf<Def>] extends [never]
			? unknown
			: ResetPasswordApi<UserOfType<Name, Def>>);

/** What every configuration answers, whatever its user types. */
export interface SharedApi<U extends { readonly type: string }> {
	/**
	 * Who a request belongs to, or `null` for an anonymous one.
	 *
	 * Reads `Authorization: Bearer`, then `X-Session-Token`, then the cookie:
	 * **the first credential present wins, not the first valid one.** A lapsed
	 * or revoked session, a user gone or inactive, or a user of another type
	 * than `options.type` is anonymous. Renews a sliding session in passing.
	 *
	 * **An outage is not anonymous**: a store that cannot answer rejects with
	 * `STORE_FAILED`. Answer 503, never 401.
	 */
	authenticate<T extends U['type'] = U['type']>(
		request: RequestLike,
		options?: { readonly type?: T },
	): Promise<Authenticated<Extract<U, { readonly type: T }>> | null>;

	/** Revokes the session a request presents. `false` when it presents none, or an unknown one. */
	signOut(request: RequestLike): Promise<boolean>;

	/** Revokes every session of a user, but `except`. Answers how many. */
	signOutEverywhere(
		user: UserRef,
		options?: { readonly except?: string },
	): Promise<number>;

	/** The user with this id, whatever their type, or `null`. */
	findUser(id: string): Promise<U | null>;

	/** The user with this id, whatever their type, or `NOT_FOUND`. */
	getUser(id: string): Promise<U>;

	/** The session cookie, as `Set-Cookie` values. Synchronous. */
	readonly cookie: {
		readonly name: string;
		serialize(token: string, session: Session): string;
		clear(): string;
	};

	/**
	 * Deletes lapsed sessions. `UNSUPPORTED` when the sessions store does not
	 * implement `deleteExpiredSessions` — a store with its own TTL does not need
	 * to.
	 */
	collectExpired(): Promise<number>;

	/** The user type names, in the order they were declared. */
	readonly types: readonly U['type'][];
}

/**
 * Whether a configuration may turn the second factor on. **A key that is
 * there at all counts**, optional or not: a `secondFactor` set from the
 * environment may be on at run time, and `signIn` must be typed for it.
 */
type TwoFactorOf<C> = 'secondFactor' extends keyof C ? true : false;

/** What `janus(config)` answers. */
export type Janus<C extends JanusConfig> = SharedApi<UserOf<C>> &
	(C extends MultiTypeConfig
		? {
				readonly [K in keyof C['users'] & string]: TypeApi<
					K,
					C['users'][K],
					TwoFactorOf<C>
				>;
			}
		: C extends SingleTypeConfig
			? TypeApi<'user', SingleAsType<C>, TwoFactorOf<C>>
			: never);

// ─── The checks, as types ─────────────────────────────────────────────────

/**
 * Makes a value that names no key of `Keys` unassignable, and says why on that
 * key.
 *
 * The reason is the **key** of an object type, and the valid names its value.
 * A string-literal message would not survive: `'emial' & 'message'` reduces to
 * `never`, which collapses the whole object and loses the sentence — measured
 * while writing `from` in the first surface. A string intersected with an
 * object does not reduce, so the compiler prints both.
 */
type CheckName<V, Keys extends string, What extends string> = [V] extends [Keys]
	? unknown
	: {
			readonly [K in `"${V & string}" is not ${What}; name one of`]: Keys;
		};

type Reserved<S> = Extract<keyof OutputOf<S>, (typeof RESERVED_FIELDS)[number]>;

/** The checks on one user type: its login, its e-mail, and its field names. */
type CheckType<Def, SchemaKey extends string> = (Def extends {
	readonly password: { readonly login: infer L };
}
	? {
			readonly password: {
				readonly login: CheckName<
					L,
					RequiredStringKeys<OutputOf<SchemaOf<Def, SchemaKey>>>,
					'a required string field'
				>;
			};
		}
	: unknown) &
	(Def extends { readonly email: infer E }
		? {
				readonly email: CheckName<
					E,
					RequiredStringKeys<OutputOf<SchemaOf<Def, SchemaKey>>>,
					'a required string field'
				>;
			}
		: unknown) &
	([Reserved<SchemaOf<Def, SchemaKey>>] extends [never]
		? unknown
		: {
				readonly [K in SchemaKey]: {
					readonly [M in `"${Reserved<SchemaOf<Def, SchemaKey>> & string}" is a field janus sets itself; rename it`]: never;
				};
			});

type SchemaOf<Def, SchemaKey extends string> = Def extends {
	readonly [K in SchemaKey]: infer S extends UserSchema;
}
	? S
	: never;

/**
 * The compile-time checks `janus` intersects into its parameter.
 *
 * `janus` infers its argument, so an excess-property check never fires;
 * intersecting `C & Checked<C>` makes a wrong value unassignable **on the
 * offending key**, with the reason as the type the compiler prints. The pattern
 * is measured in `nxgt-data/packages/mongo-kit/src/config/types.ts`.
 */
export type Checked<C> = C extends MultiTypeConfig
	? {
			readonly users: {
				readonly [K in keyof C['users']]: K extends (typeof RESERVED_TYPES)[number]
					? {
							readonly [M in `"${K & string}" cannot name a user type: janus() answers a method of that name`]: never;
						}
					: CheckType<C['users'][K], 'schema'>;
			};
		}
	: CheckType<C, 'user'>;
