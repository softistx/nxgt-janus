/**
 * What `janus()` accepts, and how it is resolved at run time.
 *
 * The types refuse first, on the offending key (`checks.ts`). What follows at
 * run time is the net for JavaScript callers, and every refusal is a bare
 * `TypeError`: a configuration is written when the application is wired, never
 * from a request.
 */

import type { RelationStore } from '../permissions/port/types';
import type { Clock } from '../time/clock';
import { type Duration, parseDuration } from '../time/duration';
import type { JanusStores } from './port/types';
import { resolveSealer, type Sealer, type SealingKey } from './sealing';
import type { StandardSchemaV1 } from './standard-schema';

/**
 * How a login is normalised before any store sees it. `'lowercaseTrim'` when
 * absent — right for an e-mail and for most usernames.
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
 * What a user schema may produce: JSON, where an object property may also be
 * `undefined` — which is what every validator's optional field produces.
 *
 * The core drops an `undefined` property before a store sees the fields, so the
 * port stays strict JSON: an optional field left out is **absent** in the
 * store, and reads back absent, which the schema's output type already allows.
 */
export type FieldsJson =
	| string
	| number
	| boolean
	| null
	| readonly FieldsJson[]
	| { readonly [key: string]: FieldsJson | undefined };

/**
 * A user type's schema: any Standard Schema — Zod 4, Valibot, ArkType — whose
 * output is an object of JSON. A `Date` round-trips through one store and not
 * the next, so a schema that produces one is refused at compile time.
 */
export type UserSchema = StandardSchemaV1<
	unknown,
	{ readonly [key: string]: FieldsJson | undefined }
>;

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
	/**
	 * Whether a hash **this hasher** wrote should be written again: its
	 * parameters are not the ones `hash` uses now — a raised `cost`, say.
	 * Optional; without it only a hash from another hasher (a `verifiers` one)
	 * is rewritten. Called with hashes carrying this hasher's prefix only.
	 */
	needsRehash?(hash: string): boolean;
}

/** Signing in with a password. */
export interface PasswordConfig {
	/**
	 * The field users sign in with: a **top-level, required string** field of
	 * the schema — `'email'`, `'username'`. A typo is a compile error.
	 */
	readonly login: string;
	/** `'lowercaseTrim'` when absent. */
	readonly normalize?: Normalize;
	/** At least 1. `8` when absent. */
	readonly minLength?: number;
}

/** How long a session lives, and when it is renewed. */
export interface SessionConfig {
	/** `'7d'` when absent. */
	readonly lifespan?: Duration;
	/**
	 * `authenticate` renews a session once this much has passed since it was
	 * opened or last renewed — a sliding session, written at most once per
	 * period. `'1d'` when absent; `false` for a fixed lifespan.
	 */
	readonly renewAfter?: Duration | false;
}

/** One user type: its schema, and how it signs in. */
export interface UserTypeConfig {
	readonly schema: UserSchema;
	readonly password?: PasswordConfig;
	/**
	 * The field holding the user's e-mail, which `verifyEmail` and
	 * `resetPassword` send to. `'email'` when absent — and when the schema has
	 * no required string `email` either, those two flows do not exist on the
	 * type.
	 */
	readonly email?: string;
	readonly session?: SessionConfig;
	/**
	 * Recorded on every user written, and read by nothing yet. Bump it when the
	 * schema tightens, and the users validated against the old one can be found.
	 * `'1'` when absent.
	 */
	readonly schemaVersion?: string;
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

interface SharedConfig {
	/** The three stores: `createMemoryStores()`, or an adapter's. */
	readonly store: JanusStores;
	/**
	 * The relation store `permissions()` is given, when the application has
	 * one. Wired here, deleting a user deletes every tuple naming them too — as
	 * a subject, and through no one else's memory of it.
	 */
	readonly relations?: RelationStore;
	/**
	 * Hashes new passwords. **Required as soon as a type signs in with a
	 * password** — there is no silent fallback. `scryptHasher()` runs on Node and
	 * Bun; `bunHasher()` is argon2id, on Bun only.
	 */
	readonly hasher?: PasswordHasher;
	/** Hashers that only verify: those a database was written with before. */
	readonly verifiers?: readonly PasswordHasher[];
	readonly clock?: Clock;
	readonly cookie?: CookieConfig;
	readonly tokens?: {
		/** `'24h'` when absent. */
		readonly verifyEmail?: Duration;
		/** `'1h'` when absent. */
		readonly resetPassword?: Duration;
	};
	/**
	 * A TOTP second factor, for every user type with a password. Absent, no
	 * `secondFactor` flows exist and `signIn` answers a session directly.
	 */
	readonly secondFactor?: SecondFactorConfig;
}

/** What a TOTP second factor needs: a name for the app, and the keys that seal. */
export interface SecondFactorConfig {
	/** Shown in the authenticator app beside the account: your product's name. */
	readonly issuer: string;
	/**
	 * The keys every TOTP secret is sealed with before a store sees it. **The
	 * first seals, every one opens**: to rotate, put the new key first and keep
	 * the old one until no secret is sealed with it.
	 */
	readonly keys: readonly [SealingKey, ...SealingKey[]];
	/** How long `signIn`'s challenge waits for a code. `'5m'` when absent. */
	readonly challenge?: Duration;
}

/** An application with one user type: `user` is its schema. */
export interface SingleTypeConfig
	extends SharedConfig,
		Omit<UserTypeConfig, 'schema'> {
	readonly user: UserSchema;
	readonly users?: never;
}

/** An application with several user types — patients and staff. */
export interface MultiTypeConfig extends SharedConfig {
	readonly users: { readonly [type: string]: UserTypeConfig };
	readonly user?: never;
	readonly password?: never;
	readonly email?: never;
	readonly session?: never;
	readonly schemaVersion?: never;
}

export type JanusConfig = SingleTypeConfig | MultiTypeConfig;

/** The type name the single-type form gives its users. */
export const SINGLE_TYPE = 'user';

/**
 * Keys `janus` sets on every user, so a schema may not declare them.
 * `password` too: it is taken beside the fields, and never stored among them.
 */
export const RESERVED_FIELDS = [
	'id',
	'type',
	'emailVerified',
	'active',
	'hasPassword',
	'hasSecondFactor',
	'version',
	'createdAt',
	'updatedAt',
	'password',
] as const;

/** Names on `janus()`'s answer, so a user type may not take one. */
export const RESERVED_TYPES = [
	'authenticate',
	'signOut',
	'signOutEverywhere',
	'findUser',
	'getUser',
	'cookie',
	'collectExpired',
	'types',
] as const;

/** One user type, with every default applied and every duration in milliseconds. */
export interface ResolvedType {
	readonly name: string;
	readonly schema: UserSchema;
	readonly schemaVersion: string;
	readonly password: {
		readonly login: string;
		readonly normalize: (value: string) => string;
		readonly minLength: number;
	} | null;
	readonly email: string;
	readonly lifespanMs: number;
	readonly renewAfterMs: number | null;
}

export interface ResolvedConfig {
	readonly single: boolean;
	readonly types: ReadonlyMap<string, ResolvedType>;
	readonly tokenTtlMs: {
		readonly verifyEmail: number;
		readonly resetPassword: number;
	};
	readonly secondFactor: {
		readonly issuer: string;
		readonly sealer: Sealer;
		readonly challengeTtlMs: number;
	} | null;
	readonly cookie: {
		readonly name: string;
		readonly domain: string | null;
		readonly path: string;
		readonly sameSite: 'lax' | 'strict' | 'none';
		readonly secure: boolean;
	};
}

const NORMALIZERS = {
	none: (value: string) => value,
	lowercase: (value: string) => value.toLowerCase(),
	lowercaseTrim: (value: string) => value.toLowerCase().trim(),
	nfkcLowercaseTrim: (value: string) =>
		value.normalize('NFKC').toLowerCase().trim(),
} as const satisfies Record<string, (value: string) => string>;

/** How an e-mail is compared: always the same rule, whatever the login's. */
export const normalizeEmail = NORMALIZERS.lowercaseTrim;

/** RFC 6265's cookie-name token: no control character, space, or separator. */
const COOKIE_NAME = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

/** A type name, or a field name: camelCase, as every key in this package. */
const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** Applies the defaults and refuses what cannot be wired. `where` names the call. */
export function resolveConfig(
	config: JanusConfig,
	where: string,
): ResolvedConfig {
	if (typeof config !== 'object' || config === null) {
		throw new TypeError(`${where}: expected a configuration object`);
	}

	const hasUser = config.user !== undefined;
	const hasUsers = config.users !== undefined;
	if (hasUser === hasUsers) {
		throw new TypeError(
			`${where}: pass either user (one user type) or users (several user types), and exactly one of them`,
		);
	}

	const entries: [string, UserTypeConfig][] = hasUsers
		? Object.entries(config.users as MultiTypeConfig['users'])
		: [
				[
					SINGLE_TYPE,
					{
						...(config as SingleTypeConfig),
						schema: config.user as UserSchema,
					},
				],
			];

	if (entries.length === 0) {
		throw new TypeError(`${where}: users declares no user type`);
	}

	const types = new Map<string, ResolvedType>();
	for (const [name, type] of entries) {
		const at = hasUsers ? `${where}: users.${name}` : where;

		if (!NAME.test(name)) {
			throw new TypeError(
				`${where}: the user type "${name}" must be a camelCase name — letters and digits, starting with a letter`,
			);
		}
		if ((RESERVED_TYPES as readonly string[]).includes(name)) {
			throw new TypeError(
				`${where}: "${name}" cannot name a user type — janus() answers a method of that name`,
			);
		}
		types.set(name, resolveType(name, type, at, hasUsers ? 'schema' : 'user'));
	}

	const hashing = [...types.values()].some((type) => type.password !== null);
	if (hashing && config.hasher === undefined) {
		throw new TypeError(
			`${where}: a user type signs in with a password and no hasher is wired — pass hasher: scryptHasher(), or bunHasher() on Bun. There is no silent fallback`,
		);
	}

	return {
		single: !hasUsers,
		types,
		tokenTtlMs: {
			verifyEmail: parseDuration(
				config.tokens?.verifyEmail ?? '24h',
				`${where}: tokens.verifyEmail`,
			),
			resetPassword: parseDuration(
				config.tokens?.resetPassword ?? '1h',
				`${where}: tokens.resetPassword`,
			),
		},
		cookie: resolveCookie(config.cookie ?? {}, where),
		secondFactor: resolveSecondFactor(config.secondFactor, where),
	};
}

function resolveSecondFactor(
	config: SecondFactorConfig | undefined,
	where: string,
): ResolvedConfig['secondFactor'] {
	if (config === undefined) return null;
	const at = `${where}: secondFactor`;
	if (typeof config?.issuer !== 'string' || config.issuer.trim() === '') {
		throw new TypeError(
			`${at}.issuer must name your application — the authenticator app shows it beside the account`,
		);
	}
	return {
		issuer: config.issuer,
		sealer: resolveSealer(config.keys, `${at}.keys`),
		challengeTtlMs: parseDuration(config.challenge ?? '5m', `${at}.challenge`),
	};
}

function resolveType(
	name: string,
	type: UserTypeConfig,
	at: string,
	schemaKey: string,
): ResolvedType {
	if (
		typeof type?.schema !== 'object' ||
		type.schema === null ||
		typeof type.schema['~standard']?.validate !== 'function'
	) {
		throw new TypeError(
			`${at}: ${schemaKey} must be a Standard Schema — a Zod 4, Valibot or ArkType schema`,
		);
	}

	let password: ResolvedType['password'] = null;
	if (type.password !== undefined) {
		const minLength = type.password.minLength ?? 8;
		if (!Number.isInteger(minLength) || minLength < 1) {
			throw new TypeError(
				`${at}: password.minLength must be an integer of at least 1`,
			);
		}
		password = {
			login: fieldName(type.password.login, `${at}: password.login`),
			normalize: normalizer(
				type.password.normalize ?? 'lowercaseTrim',
				`${at}: password.normalize`,
			),
			minLength,
		};
	}

	const renewAfter = type.session?.renewAfter ?? '1d';

	return {
		name,
		schema: type.schema,
		schemaVersion: type.schemaVersion ?? '1',
		password,
		email: fieldName(type.email ?? 'email', `${at}: email`),
		lifespanMs: parseDuration(
			type.session?.lifespan ?? '7d',
			`${at}: session.lifespan`,
		),
		renewAfterMs:
			renewAfter === false
				? null
				: parseDuration(renewAfter, `${at}: session.renewAfter`),
	};
}

function resolveCookie(
	cookie: CookieConfig,
	where: string,
): ResolvedConfig['cookie'] {
	const name = cookie.name ?? 'janus-session';
	if (!COOKIE_NAME.test(name)) {
		throw new TypeError(
			`${where}: cookie.name must be a cookie-name token — letters, digits and !#$%&'*+-.^_\`|~, with no space, ";" or "="`,
		);
	}
	const sameSite = cookie.sameSite ?? 'lax';
	const secure = cookie.secure ?? true;
	if (sameSite === 'none' && !secure) {
		throw new TypeError(
			`${where}: cookie.sameSite "none" requires cookie.secure — browsers refuse the cookie otherwise`,
		);
	}

	return {
		name,
		domain: cookie.domain ?? null,
		path: cookie.path ?? '/',
		sameSite,
		secure,
	};
}

function fieldName(field: unknown, where: string): string {
	if (typeof field !== 'string' || !NAME.test(field)) {
		throw new TypeError(
			`${where} must name a top-level field of the schema, such as "email"`,
		);
	}
	if ((RESERVED_FIELDS as readonly string[]).includes(field)) {
		throw new TypeError(`${where}: "${field}" is a field janus sets itself`);
	}
	return field;
}

function normalizer(rule: Normalize, where: string): (value: string) => string {
	if (typeof rule === 'function') return rule;
	if (typeof rule === 'string' && Object.hasOwn(NORMALIZERS, rule)) {
		return NORMALIZERS[rule];
	}

	throw new TypeError(
		`${where} must be "none", "lowercase", "lowercaseTrim", "nfkcLowercaseTrim" or a function`,
	);
}
