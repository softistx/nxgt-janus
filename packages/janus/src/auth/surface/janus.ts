/**
 * The whole surface: one user type's, every configuration's, and what
 * `janus(config)` answers.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { JanusConfig, MultiTypeConfig, SingleTypeConfig } from '../config';
import type { ResetPasswordApi, SignInCodeApi, VerifyEmailApi } from './email';
import type {
	EmailOf,
	FieldsInput,
	LoginOf,
	SingleAsType,
	UserOf,
	UserOfType,
} from './inference';
import type { PasswordApi } from './password';
import type { SecondFactorApi } from './second-factor';
import type { Authenticated, RequestLike, Session } from './session';
import type { SignedIn, SignInResult } from './sign-in';
import type { UserRef } from './user';
import type { UserTypeApi } from './user-type';

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
