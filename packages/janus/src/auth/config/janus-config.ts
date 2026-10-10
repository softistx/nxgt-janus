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
		/** How long an e-mailed sign-in link waits. `'15m'` when absent. */
		readonly magicLink?: Duration;
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
	 * How the requests that hand out something to e-mail answer a loop. **On
	 * by default**: past five requests of one flow for one address — or one
	 * user, once signed in — in a 15-minute window, the request answers
	 * `MAIL_THROTTLED` with `retryAfter`, and issues nothing, until the next
	 * window.
	 */
	readonly mail?: MailConfig;
	/**
	 * A TOTP second factor, for every user type with a password. Absent, no
	 * `secondFactor` flows exist and `signIn` answers a session directly.
	 */
	readonly secondFactor?: SecondFactorConfig;
	/**
	 * Device tokens, for a notice when a user signs in from a device they had
	 * not signed in from. Absent, no sign-in may be given a `device`, and every
	 * answer's `newDevice` is `false`.
	 */
	readonly devices?: DevicesConfig;
	/**
	 * Called with every user event — `user.created`, `user.emailVerified`,
	 * `user.passwordReset`, `user.passwordChanged`, `user.emailChanged`,
	 * `user.secondFactorEnabled`, `user.secondFactorDisabled`,
	 * `user.recoveryCodesRegenerated`, `user.recoveryCodeUsed`,
	 * `user.newDeviceSignedIn`, `user.deleted` — once the write landed,
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

/** What the requests that hand out something to e-mail do with a loop. */
export interface MailConfig {
	/**
	 * The requests one address — or one user — may make per flow and per
	 * window: `magicLink.request`, `signInCode.request` and
	 * `resetPassword.request` per address, `verifyEmail.send` and an e-mailed
	 * `stepUp.request` per user. `{ attempts: 5, window: '15m' }` when absent;
	 * `false` counts nothing — rate-limit those requests yourself then.
	 */
	readonly throttle?: MailThrottleConfig | false;
}

/** How many requests of one flow one address or user may make, and per how long. */
export interface MailThrottleConfig {
	/** Requests per flow, per address or user, and per window. `5` when absent. */
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

/**
 * The keys device tokens are signed with. **Nothing is stored**: a device
 * token is the device's id and a keyed hash binding it to the user, kept by
 * the application in a long-lived cookie.
 */
export interface DevicesConfig {
	/**
	 * **The first signs, every one checks**: a token signed with an older key
	 * is known, and answered signed again with the first. A token whose key
	 * is gone is a new device — so **removing a key is the only way to forget
	 * devices**, and it forgets every device it signed.
	 */
	readonly keys: readonly [SealingKey, ...SealingKey[]];
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
