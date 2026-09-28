/**
 * The public types: what `useJanus()` takes, and what it puts on the
 * GraphQL context. Nothing here runs.
 */

import type { Session, SharedApi } from '@nxgt/janus';

/** Anything `janus()` answered: the part of it this package calls. */
export type Auth<U extends { readonly type: string }> = Pick<
	SharedApi<U>,
	'authenticate' | 'types'
>;

/** The users an `auth` instance knows, as a union narrowed by `user.type`. */
export type UserOfAuth<A> = A extends Auth<infer U> ? U : never;

/** What `useJanus()` takes. */
export interface JanusOptions<A, P, T extends string> {
	/** What `janus()` answered. */
	readonly auth: A;
	/**
	 * What `permissions()` answered: `ctx.janus.access`, and what `can()`
	 * asks. Absent, the context has no `access`, and `can()` does not compile.
	 */
	readonly access?: P;
	/** Only a user of this type is authenticated here; any other is anonymous. */
	readonly type?: T;
}

/**
 * `ctx.janus`, one per request.
 *
 * `user()` and `session()` call `auth.authenticate` on the request the first
 * time either is asked, and never when neither is: a query that reads no
 * guarded field costs no store call. Both share that one answer.
 */
export type JanusOnContext<U, P> = {
	/**
	 * Who the request belongs to, or `null` for an anonymous one. **An outage
	 * is not anonymous**: a store that cannot answer rejects with
	 * `STORE_FAILED`, answered 503.
	 */
	user(): Promise<U | null>;
	/** The session the request presented, or `null` for an anonymous one. */
	session(): Promise<Session | null>;
} & ([P] extends [undefined] ? unknown : { readonly access: P });

/**
 * The context `useJanus()` adds to, for your resolvers:
 * `YogaInitialContext & JanusContext<typeof auth, typeof access>`.
 *
 * `T` narrows the user to the types `useJanus({ type })` was given.
 */
export type JanusContext<
	A,
	P = undefined,
	T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
> = {
	readonly janus: JanusOnContext<
		Extract<UserOfAuth<A>, { readonly type: T }>,
		P
	>;
};
