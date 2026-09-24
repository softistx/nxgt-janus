/**
 * The identity core's public shapes: the definition an application writes, and
 * the surface `createIdentities` hands back.
 *
 * The generic form lives here; the implementation works on a degenericised
 * mirror and casts once, in `create.ts`. That is `nxgt-data`'s shape
 * (`drizzle-meilisearch/src/types.ts`), and it keeps the traits type travelling
 * through every public method without dragging a type parameter through every
 * internal function.
 */

import type { IdentityId } from '../ids/identity-id';
import type { CursorPage } from '../pagination/cursor-page';
import type { Clock } from '../time/clock';
import type { Duration } from '../time/duration';
import type {
	AuthenticatorAssuranceLevel,
	CredentialType,
	IdentityState,
	JsonObject,
	SessionId,
	SessionRecord,
	TokenKind,
	VerifiableAddress,
} from './port/types';
import type { StandardSchemaV1 } from './standard-schema';

/**
 * How an identifier is normalised before any store sees it.
 *
 * **Explicit, never implied.** There is no default: `'lowercaseTrim'` is right
 * for most e-mail addresses and wrong for a username somebody chose with care,
 * and "why does `Bob@x.com` not find `bob@x.com`" is not a question anybody
 * should have to debug. Uniqueness is uniqueness of the normalised bytes, so no
 * adapter needs a collation.
 *
 * A function is accepted for anything else. It must be deterministic: the same
 * rule normalises at sign-up and at sign-in.
 */
export type Normalize =
	| 'none'
	| 'lowercase'
	| 'lowercaseTrim'
	| 'nfkcLowercaseTrim'
	| ((value: string) => string);

/**
 * What a traits schema may produce: JSON, where an object property may also be
 * `undefined` — which is what every validator's optional field produces.
 *
 * The core drops an `undefined` property before a store sees the traits, so the
 * port stays strict JSON: an optional trait left out is **absent** in the
 * store, and reads back absent, which the schema's output type already allows.
 */
export type TraitsJson =
	| string
	| number
	| boolean
	| null
	| readonly TraitsJson[]
	| { readonly [key: string]: TraitsJson | undefined };

/** One identifier: which trait it reads, and how it is normalised. */
export interface IdentifierConfig {
	/** A path to a **string leaf** of the traits — `'email'`, `'name.handle'`. */
	readonly from: string;
	readonly normalize: Normalize;
}

/** The code identifier also says which channel carries the code. */
export interface CodeIdentifierConfig extends IdentifierConfig {
	readonly via: 'email';
}

/**
 * What `defineIdentities` accepts.
 *
 * Nothing here is read from the schema's own annotations: Janus does not look
 * for `.email()` to decide an address is an e-mail. `verification: { from:
 * 'email' }` says so, once, in a field — the TypeScript, checked version of
 * Kratos's `ory.sh/kratos` annotations.
 */
export interface IdentitiesConfig {
	/**
	 * The traits schema, as any Standard Schema: Zod 4, Valibot, ArkType. Its
	 * output must be an object of JSON ({@link TraitsJson}) — a `Date`
	 * round-trips through one store and not the next, so a schema that produces
	 * one is refused at compile time.
	 */
	readonly traits: StandardSchemaV1<
		unknown,
		{ readonly [key: string]: TraitsJson | undefined }
	>;
	/**
	 * Recorded on every identity written, and read by nothing yet. Bump it when
	 * the schema tightens, and the identities validated against the old one
	 * can be found. `'1'` when absent.
	 */
	readonly schemaVersion?: string;
	readonly identifiers: {
		readonly password?: IdentifierConfig;
		readonly code?: CodeIdentifierConfig;
	};
	/** The trait holding the address a verification token is sent to. */
	readonly verification?: { readonly from: string };
	/** The trait holding the address a recovery token is sent to. */
	readonly recovery?: { readonly from: string };
	readonly password?: {
		/** At least 1. `8` when absent. */
		readonly minLength?: number;
	};
	readonly session?: {
		/** `'24h'` when absent, as in Kratos. */
		readonly lifespan?: Duration;
		/**
		 * A session is extended only once it has less than this left to live.
		 * Absent: every `extend` extends. Kratos's `earliest_possible_extend`.
		 */
		readonly earliestRefresh?: Duration;
	};
	readonly tokens?: {
		/** `'1h'` when absent. */
		readonly verification?: Duration;
		/** `'15m'` when absent. */
		readonly recovery?: Duration;
	};
	readonly cookie?: CookieConfig;
}

/** The session cookie. Every default is the strict one. */
export interface CookieConfig {
	/** `'janus-session'` when absent. A cookie-name token: no space, no `;`, no `=`. */
	readonly name?: string;
	readonly domain?: string;
	/** `'/'` when absent. */
	readonly path?: string;
	/** `'lax'` when absent. */
	readonly sameSite?: 'lax' | 'strict' | 'none';
	/** `true` when absent. `sameSite: 'none'` requires it. */
	readonly secure?: boolean;
}

/** What the traits schema produces: the type every traits-bearing method speaks. */
export type TraitsOf<C extends IdentitiesConfig> = StandardSchemaV1.InferOutput<
	C['traits']
>;

/** What the traits schema accepts: what `create` and `updateTraits` take. */
export type TraitsInputOf<C extends IdentitiesConfig> =
	StandardSchemaV1.InferInput<C['traits']>;

/**
 * Every dotted path to a **required string** leaf of `T`.
 *
 * Required, because an identifier read from an optional trait is an identity
 * that may have no way to sign in. Arrays are not descended: `tags.0` is not an
 * identifier anybody means.
 */
export type StringLeaves<T, Prefix extends string = ''> = T extends object
	? {
			[K in keyof T & string]-?: T[K] extends string
				? `${Prefix}${K}`
				: T[K] extends readonly unknown[]
					? never
					: T[K] extends object
						? StringLeaves<T[K], `${Prefix}${K}.`>
						: never;
		}[keyof T & string]
	: never;

/**
 * Makes a `from` that names no string leaf unassignable, and says why under
 * `from`.
 *
 * The reason is the **key** of an object type, and the valid paths its value.
 * A string-literal message would not survive: `'emial' & 'message'` reduces to
 * `never`, which collapses the whole object and loses the sentence — measured
 * while writing this. A string intersected with an object does not reduce, so
 * the compiler prints both.
 */
type CheckFrom<F, Leaves extends string> = F extends {
	readonly from: infer P extends string;
}
	? [P] extends [Leaves]
		? unknown
		: {
				readonly from: {
					readonly [K in `"${P}" is not a required string trait; name one of`]: Leaves;
				};
			}
	: unknown;

/**
 * The compile-time checks `defineIdentities` intersects into its parameter.
 *
 * `defineIdentities` infers its argument, so an excess-property check never
 * fires; intersecting `C & Checked<C>` makes a wrong value unassignable **on the
 * offending key**, with the reason as the type the compiler prints. The
 * pattern is measured in `nxgt-data/packages/mongo-kit/src/config/types.ts`.
 */
export type Checked<C extends IdentitiesConfig> = {
	readonly identifiers: {
		readonly [K in keyof C['identifiers']]: CheckFrom<
			C['identifiers'][K],
			StringLeaves<TraitsOf<C>>
		>;
	};
} & (C['verification'] extends { readonly from: string }
	? {
			readonly verification: CheckFrom<
				C['verification'],
				StringLeaves<TraitsOf<C>>
			>;
		}
	: unknown) &
	(C['recovery'] extends { readonly from: string }
		? {
				readonly recovery: CheckFrom<C['recovery'], StringLeaves<TraitsOf<C>>>;
			}
		: unknown);

/**
 * A described, checked configuration. Opaque: made by `defineIdentities`,
 * consumed by `createIdentities`.
 */
export interface IdentitiesDefinition<C extends IdentitiesConfig> {
	readonly config: C;
	/** Brand: only `defineIdentities` makes one. */
	readonly kind: 'janus.identities';
}

/**
 * An identity, as application code sees it.
 *
 * **No `credentials`.** No code path can hand a password hash to a request
 * handler, because no type that reaches one carries it; `test/types/` pins
 * that. `hasPassword` is what a settings page actually needs.
 */
export interface Identity<Traits> {
	readonly id: IdentityId;
	readonly schemaVersion: string;
	readonly state: IdentityState;
	readonly traits: Traits;
	readonly identifiers: readonly {
		readonly type: CredentialType;
		readonly value: string;
	}[];
	readonly addresses: readonly VerifiableAddress[];
	readonly hasPassword: boolean;
	readonly metadataPublic: JsonObject;
	readonly metadataAdmin: JsonObject;
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** A session, as application code sees it: everything but the token's hash. */
export type Session = Omit<SessionRecord, 'tokenHash'>;

/** A session and the identity it belongs to: what `resolve` finds. */
export interface Resolved<Traits> {
	readonly session: Session;
	readonly identity: Identity<Traits>;
}

/**
 * Why a password did not verify.
 *
 * **Never put `reason` in a response body.** `noSuchIdentity` is an account
 * enumeration oracle: it is here for your logs and your rate limiter.
 */
export type PasswordRefusal =
	| 'noSuchIdentity'
	| 'noPasswordCredential'
	| 'wrongPassword'
	| 'identityInactive';

/**
 * What `verifyPassword` answers. **The type that carries the invariant**: an
 * `ok: false` always means the core looked at a credential and said no. A store
 * that could not answer throws, and this never resolves `ok: false` because of
 * it.
 */
export type PasswordVerification<Traits> =
	| { readonly ok: true; readonly identity: Identity<Traits> }
	| { readonly ok: false; readonly reason: PasswordRefusal };

/**
 * A password hashing scheme — the second port.
 *
 * Hashes are self-describing, so **every wired hasher can verify, and exactly
 * one hashes** new passwords. A database written under Bun reads under Node and
 * back, as long as a verifier for each prefix is wired.
 */
export interface PasswordHasher {
	/** The prefix every hash it writes starts with: `'$argon2id$'`, `'$scrypt$'`. */
	readonly prefix: string;
	hash(plain: string): Promise<string>;
	verify(plain: string, hash: string): Promise<boolean>;
}

/** What `createIdentities` takes beside the definition and the stores. */
export interface IdentitiesOptions {
	/**
	 * Hashes new passwords. **Required as soon as a password is set or
	 * verified** — there is no silent fallback. `scryptHasher()` runs on Node
	 * and Bun; `bunHasher()` is argon2id, on Bun only.
	 */
	readonly hasher?: PasswordHasher;
	/** Hashers that only verify: those a database was written with before. */
	readonly verifiers?: readonly PasswordHasher[];
	readonly clock?: Clock;
}

/** Options every write that follows a read may take. */
export interface WriteOptions {
	/**
	 * The version the identity must still hold. With it, one round trip; without
	 * it, the core reads first — two round trips, just as safe.
	 */
	readonly ifVersion?: number;
}

/** A session token, given to the application **once**, and never stored. */
export interface IssuedSession {
	readonly token: string;
	readonly session: Session;
}

/** What `resolve` reads a session token from. */
export type HeaderSource =
	| Headers
	| { readonly [name: string]: string | undefined };

/** The identity core, as `createIdentities` assembles it. */
export interface Identities<Traits, TraitsInput = Traits> {
	/**
	 * Creates an identity. Validates the traits, derives identifiers and
	 * addresses, hashes the password when one is given, and writes once.
	 *
	 * Rejects with `TRAITS_INVALID`, `PASSWORD_TOO_SHORT`, `IDENTIFIER_TAKEN`,
	 * or `STORE_FAILED`.
	 */
	create(input: {
		readonly traits: TraitsInput;
		readonly password?: string;
		readonly state?: IdentityState;
		readonly metadataPublic?: JsonObject;
		readonly metadataAdmin?: JsonObject;
	}): Promise<Identity<Traits>>;

	/** The identity, or `null`. A malformed id is `null`, never a store call. */
	find(id: string): Promise<Identity<Traits> | null>;

	/** The identity, or `NOT_FOUND`. */
	get(id: string): Promise<Identity<Traits>>;

	/** The identity holding this identifier, normalised as the definition says, or `null`. */
	findByIdentifier(
		type: CredentialType,
		value: string,
	): Promise<Identity<Traits> | null>;

	/** One page, in creation order. A cursor this package did not mint is `INVALID_CURSOR`. */
	list(page?: {
		readonly after?: string | null;
		readonly limit?: number;
	}): Promise<CursorPage<Identity<Traits>>>;

	/**
	 * Replaces the traits, **whole and validated** — the schema's full input
	 * type, never a partial. Identifiers follow; an address whose value did not
	 * change keeps its verification.
	 */
	updateTraits(
		id: string,
		traits: TraitsInput,
		options?: WriteOptions,
	): Promise<Identity<Traits>>;

	/** Activates or deactivates. Nothing else on the identity moves. */
	setState(
		id: string,
		state: IdentityState,
		options?: WriteOptions,
	): Promise<Identity<Traits>>;

	/** Replaces one or both metadata objects. The one not named is kept. */
	updateMetadata(
		id: string,
		metadata: {
			readonly metadataPublic?: JsonObject;
			readonly metadataAdmin?: JsonObject;
		},
		options?: WriteOptions,
	): Promise<Identity<Traits>>;

	/** Marks an address verified or not, **addressed by value**. `NOT_FOUND` if the identity holds no such address. */
	setAddressVerified(
		id: string,
		address: string,
		verified: boolean,
		options?: WriteOptions,
	): Promise<Identity<Traits>>;

	/** Sets or replaces the password. `PASSWORD_TOO_SHORT` below the policy. */
	setPassword(
		id: string,
		password: string,
		options?: WriteOptions,
	): Promise<Identity<Traits>>;

	/** Removes the password. `CREDENTIAL_MISSING` when there is none. */
	removePassword(id: string, options?: WriteOptions): Promise<Identity<Traits>>;

	/**
	 * Checks a password against the identity holding this password identifier.
	 *
	 * When no identity holds it, the core still verifies against a dummy hash,
	 * so the response time does not say which addresses are registered. **The
	 * store's own latency stays observable**, and that limit is documented
	 * rather than denied.
	 */
	verifyPassword(
		identifier: string,
		password: string,
	): Promise<PasswordVerification<Traits>>;

	readonly sessions: {
		/**
		 * Opens a session for an active identity. The token is in the answer and
		 * nowhere else: the store holds its hash.
		 */
		create(
			identityId: string,
			options?: { readonly aal?: AuthenticatorAssuranceLevel },
		): Promise<IssuedSession>;

		/**
		 * The session a request carries, and its identity — or `null` for an
		 * anonymous request. `Authorization: Bearer`, then `X-Session-Token`,
		 * then the cookie: **the first credential present wins, not the first
		 * valid one.** A lapsed or revoked session, or one whose identity is gone,
		 * is anonymous. An inactive identity is `IDENTITY_INACTIVE`.
		 */
		resolve(headers: HeaderSource): Promise<Resolved<Traits> | null>;

		/**
		 * Extends a session by the lifespan — once it is within
		 * `earliestRefresh` of expiring. `null` when it is revoked or gone.
		 */
		extend(session: Session): Promise<Session | null>;

		/** Revokes one session. `false` when there is none. */
		revoke(sessionId: SessionId): Promise<boolean>;

		/** Revokes every session of an identity, but `except`. Answers how many. */
		revokeAll(
			identityId: string,
			options?: { readonly except?: SessionId },
		): Promise<number>;

		/**
		 * Deletes lapsed sessions. `UNSUPPORTED` when the sessions store does not
		 * implement `deleteExpiredSessions` — a store with its own TTL does not
		 * need to.
		 */
		collectExpired(): Promise<number>;
	};

	readonly tokens: {
		/**
		 * Issues a one-time token for an address the identity holds. The secret
		 * is in the answer and nowhere else. Sending it is the application's.
		 */
		issue(
			kind: TokenKind,
			identityId: string,
			address: string,
		): Promise<{ readonly secret: string; readonly expiresAt: Date }>;

		/** Redeems a verification token and marks its address verified. */
		consumeVerification(secret: string): Promise<Identity<Traits>>;

		/**
		 * Redeems a recovery token and answers the identity. **Opens no
		 * session**: what a recovered account may do next is the application's
		 * policy.
		 */
		consumeRecovery(secret: string): Promise<Identity<Traits>>;
	};

	/** The session cookie, as `Set-Cookie` values. Synchronous. */
	readonly cookie: {
		readonly name: string;
		serialize(token: string, session: Session): string;
		clear(): string;
	};
}

/** The surface for a definition. */
export type IdentitiesOf<C extends IdentitiesConfig> = Identities<
	TraitsOf<C>,
	TraitsInputOf<C>
>;

export type { TokenKind };
