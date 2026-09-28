/**
 * The whole of what `janus()` accepts: the settings every user type shares,
 * and the two forms — one user type, or several.
 */

import type { RelationStore } from '../../permissions/port/types';
import type { Clock } from '../../time/clock';
import type { Duration } from '../../time/duration';
import type { UserEventListener } from '../events';
import type { JanusStores } from '../port/types';
import type { SealingKey } from '../sealing';
import type { PasswordHasher } from './hasher';
import type { UserSchema, UserTypeConfig } from './user-type';

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
		/** How long an e-mailed sign-in code waits. `'10m'` when absent. */
		readonly signInCode?: Duration;
		/** How long a step-up's challenge waits, e-mailed or not. `'10m'` when absent. */
		readonly stepUp?: Duration;
	};
	/**
	 * How `signIn` answers password guessing. **On by default**: past ten
	 * passwords tried at one login in a 15-minute window, `signIn` answers
	 * `CREDENTIALS_INVALID` with `retryAfter` — the right password included —
	 * until the next window. Nothing locks: the next window signs in.
	 */
	readonly signIn?: SignInConfig;
	/**
	 * A TOTP second factor, for every user type with a password. Absent, no
	 * `secondFactor` flows exist and `signIn` answers a session directly.
	 */
	readonly secondFactor?: SecondFactorConfig;
	/**
	 * Called with every user event — `user.created`, `user.emailVerified`,
	 * `user.passwordReset`, `user.secondFactorEnabled`,
	 * `user.secondFactorDisabled`, `user.recoveryCodesRegenerated`,
	 * `user.recoveryCodeUsed`, `user.deleted` — once the write landed,
	 * and awaited before the flow answers. Any function will do;
	 * `webhooks({ … })` from `@nxgt/janus-webhooks` signs and delivers them.
	 */
	readonly events?: UserEventListener;
}

/** What `signIn` does with password guessing. */
export interface SignInConfig {
	/**
	 * The passwords one login may try per window. `{ attempts: 10, window:
	 * '15m' }` when absent; `false` counts nothing — rate-limit `signIn`
	 * yourself then.
	 */
	readonly throttle?: SignInThrottleConfig | false;
}

/** How many passwords one login may try, and per how long. */
export interface SignInThrottleConfig {
	/** Passwords tried per login and per window, the right one included. `10` when absent. */
	readonly attempts?: number;
	/** How long one window lasts. `'15m'` when absent. */
	readonly window?: Duration;
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
