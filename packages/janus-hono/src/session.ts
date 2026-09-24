import type { Session, SharedApi } from '@nxgt/janus';
import type { Context, MiddlewareHandler } from 'hono';
import { getCookie } from 'hono/cookie';

/** Anything `janus()` answered: the part of it this package calls. */
type Auth<U extends { readonly type: string }> = Pick<
	SharedApi<U>,
	'authenticate' | 'signOut' | 'cookie'
>;

/** The users an `auth` instance knows, as a union narrowed by `user.type`. */
export type UserOfAuth<A> = A extends Auth<infer U> ? U : never;

/**
 * What `session()` sets on the context: `c.var.user` and `c.var.session`,
 * both `null` for an anonymous request unless the route requires a user.
 *
 * `new Hono<SessionEnv<typeof auth>>()` types every route of an app that
 * wires `app.use(session(auth))` once.
 */
export type SessionEnv<
	A,
	T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
	Required extends boolean = false,
> = {
	// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
	Variables: Required extends true
		? {
				user: Extract<UserOfAuth<A>, { readonly type: T }>;
				session: Session;
			}
		: {
				user: Extract<UserOfAuth<A>, { readonly type: T }> | null;
				session: Session | null;
			};
};

export interface SessionOptions<T extends string> {
	/** Only a user of this type is signed in here; any other is anonymous. */
	readonly type?: T;
	/**
	 * `true`: an anonymous request is answered 401, with no body, and the
	 * route never runs — so `c.var.user` is never `null` in it.
	 */
	readonly required?: boolean;
}

/**
 * The middleware that reads who a request belongs to — `auth.authenticate`
 * on the request — and sets `c.var.user` and `c.var.session`.
 *
 * **An outage is not anonymous**: a store that cannot answer rejects with
 * `STORE_FAILED`, and this middleware lets it through to `app.onError` —
 * `janusErrors()` answers it 503, never 401.
 *
 * A session renewed in passing is sent again as a cookie, after the route
 * ran — but only to a request that presented it as one: a client that sends
 * `Authorization: Bearer` is not handed a cookie it never asked for.
 */
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options: SessionOptions<T> & { readonly required: true },
): MiddlewareHandler<SessionEnv<A, T, true>>;
export function session<
	A extends Auth<{ readonly type: string }>,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	auth: A,
	options?: SessionOptions<T> & { readonly required?: false },
): MiddlewareHandler<SessionEnv<A, T>>;
export function session(
	auth: Auth<{ readonly type: string }>,
	options: SessionOptions<string> = {},
): MiddlewareHandler {
	return async (c, next) => {
		const current = await auth.authenticate(
			c.req.raw,
			options.type === undefined ? undefined : { type: options.type },
		);

		if (current === null && options.required === true) {
			return c.body(null, 401);
		}
		c.set('user', current?.user ?? null);
		c.set('session', current?.session ?? null);

		await next();

		if (
			current?.renewed === true &&
			getCookie(c, auth.cookie.name) === current.token
		) {
			sendSession(c, auth, current);
		}
	};
}

/**
 * Sends the session cookie — after `signUp`, `signIn`, or anything else that
 * answered a token and its session. Appends: a cookie set before stays.
 */
export function sendSession(
	c: Context,
	auth: Pick<Auth<{ readonly type: string }>, 'cookie'>,
	opened: { readonly token: string; readonly session: Session },
): void {
	c.header('Set-Cookie', auth.cookie.serialize(opened.token, opened.session), {
		append: true,
	});
}

/**
 * Revokes the session the request presents and clears the cookie — cleared
 * whatever the answer, so a browser holding a stale cookie drops it too.
 * `false` when the request presented no session, or an unknown one.
 */
export async function signOut(
	c: Context,
	auth: Pick<Auth<{ readonly type: string }>, 'signOut' | 'cookie'>,
): Promise<boolean> {
	const revoked = await auth.signOut(c.req.raw);
	c.header('Set-Cookie', auth.cookie.clear(), { append: true });
	return revoked;
}
