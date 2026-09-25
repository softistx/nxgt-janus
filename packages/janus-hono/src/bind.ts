import type { Session } from '@nxgt/janus';
import type {
	CheckableOf,
	ModelConfig,
	ObjectTypeOf,
	Permissions,
} from '@nxgt/janus/permissions';
import type { Context, MiddlewareHandler } from 'hono';
import {
	type Awaitable,
	type ObjectData,
	type OptionsArgs,
	permission,
} from './permission';
import { provide } from './provide';
import {
	type Auth,
	type SessionEnv,
	type SessionOptions,
	sendSession,
	session,
	signOut,
	type UserOfAuth,
} from './session';

/** `session(auth, options?)`, with `auth` bound: the same three forms. */
export interface BoundSession<A> {
	<const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type']>(
		options: SessionOptions<T> & { readonly required: true },
	): MiddlewareHandler<SessionEnv<A, T, true>>;
	<const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type']>(
		options?: SessionOptions<T> & { readonly required?: false },
	): MiddlewareHandler<SessionEnv<A, T>>;
	<const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type']>(
		options: SessionOptions<T>,
	): MiddlewareHandler<SessionEnv<A, T>>;
}

/** `permission(access, …)`, with `access` bound. */
export type BoundPermission<C extends ModelConfig> = <
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
	O extends ObjectData<C, T>,
>(
	permission: P,
	type: T,
	load: (c: Context) => Awaitable<O | null>,
	...options: OptionsArgs<C, T, P, O>
) => MiddlewareHandler<{
	// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
	Variables: { object: O };
}>;

/** The functions of this package that take `auth`, with `auth` bound. */
export interface BoundAuth<A> {
	readonly session: BoundSession<A>;
	/** `sendSession(c, auth, signedIn)`: sets the cookie, answers the user. */
	readonly sendSession: <U>(
		c: Context,
		signedIn: {
			readonly token: string;
			readonly session: Session;
			readonly user: U;
		},
	) => U;
	/** `signOut(c, auth)`. */
	readonly signOut: (c: Context) => Promise<boolean>;
}

/** What `bindJanus()` takes: the `janus()` instance, the `permissions()` one, or both. */
export interface Bindable {
	readonly auth?: Auth<{ readonly type: string }>;
	/** What `permission()` takes: a `permissions()` instance, or its `can`. */
	readonly access?: { readonly can: unknown };
}

/**
 * What `bindJanus(instances)` answers: `provide()` always; `session`,
 * `sendSession` and `signOut` with `auth`; `permission` with `access`.
 */
export type Bound<I extends Bindable> = {
	/** `provide(instances)`: every instance bound, on the context. */
	readonly provide: () => MiddlewareHandler<{
		// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
		Variables: { [K in keyof I & keyof Bindable]: I[K] };
	}>;
} & (I['auth'] extends Auth<{ readonly type: string }>
	? BoundAuth<I['auth']>
	: unknown) &
	(I['access'] extends Pick<Permissions<infer C>, 'can'>
		? { readonly permission: BoundPermission<C> }
		: unknown);

/**
 * This package's functions with the instances bound once, so no route
 * repeats them:
 *
 * ```ts
 * const j = bindJanus({ auth, access });
 * const app = new Hono()
 *   .use(j.session(), j.provide())
 *   .get('/records/:id', j.permission('view', 'record', recordOf), (c) => c.json(c.var.object));
 * ```
 *
 * The same functions, typed the same way: `j.session({ required: true })` is
 * `session(auth, { required: true })`. Only what is given is bound — a
 * `permission` without `access` is absent from the type.
 */
export function bindJanus<const I extends Bindable>(instances: I): Bound<I> {
	const { auth, access } = instances;
	const bound: Record<string, unknown> = {
		provide: () => provide(instances),
	};
	if (auth !== undefined) {
		bound.session = (options: SessionOptions<string> = {}) =>
			session(auth, options);
		bound.sendSession = (
			c: Context,
			signedIn: Parameters<typeof sendSession>[2],
		) => sendSession(c, auth, signedIn);
		bound.signOut = (c: Context) => signOut(c, auth);
	}
	if (access !== undefined) {
		const guard = permission as unknown as (
			access: object,
			...rest: unknown[]
		) => MiddlewareHandler;
		bound.permission = (...rest: unknown[]) => guard(access, ...rest);
	}
	return bound as Bound<I>;
}
