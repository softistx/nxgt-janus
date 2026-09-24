import type {
	CheckableOf,
	CtxOf,
	FieldsOf,
	ModelConfig,
	ObjectTypeOf,
	Permissions,
	SubjectRef,
} from '@nxgt/janus/permissions';
import type { Context, MiddlewareHandler } from 'hono';

/**
 * An object of type `T` as the application loads it: its id, **every field a
 * `fromField` of its type reads**, and whatever else it carries. The type is
 * the middleware's to add.
 */
export type ObjectData<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

type Awaitable<V> = V | Promise<V>;

/**
 * The options of `permission()`: `ctx` required exactly when a condition of
 * the permission is reachable, as for `can()`.
 */
export type PermissionOptions<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = {
	/**
	 * Who asks. `c.var.user` — set by `session()` — when absent; pass it when
	 * your users are not `janus()`'s. `null` is anonymous.
	 */
	readonly subject?: (c: Context) => Awaitable<SubjectRef<C> | null>;
} & ([CtxOf<C, T, P>] extends [never]
	? { readonly ctx?: never }
	: {
			/** The condition's context, read from the request and the loaded object. */
			readonly ctx: (c: Context, object: O) => Awaitable<CtxOf<C, T, P>>;
		});

/**
 * The options argument: required exactly when `ctx` is. Loose when `P` is its
 * whole constraint — what the compiler falls back to when the permission was
 * wrong — so the error names the permission, not a missing argument; the rule
 * `can()` follows.
 */
type OptionsArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = [CheckableOf<C, T>] extends [P]
	? IsSingle<CheckableOf<C, T>> extends true
		? StrictArgs<C, T, P, O>
		: [options?: LooseOptions]
	: StrictArgs<C, T, P, O>;

type StrictArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
	O,
> = [CtxOf<C, T, P>] extends [never]
	? [options?: PermissionOptions<C, T, P, O>]
	: [options: PermissionOptions<C, T, P, O>];

type LooseOptions = {
	readonly subject?: (c: Context) => unknown;
	readonly ctx?: (c: Context, object: never) => unknown;
};

type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;

/** Whether `U` is one type rather than a union of several. */
type IsSingle<U> = [U] extends [UnionToIntersection<U>] ? true : false;

type LooseCan = (
	subject: SubjectRef<ModelConfig> | null,
	permission: string,
	object: { readonly type: string; readonly id: string },
	options?: { readonly ctx: unknown },
) => Promise<boolean>;

/**
 * The middleware that lets a request through only if its subject holds
 * `permission` on an object of `type`: it loads the object once, with `load`,
 * checks it with `access.can`, and hands it to the route as `c.var.object`.
 *
 * | The request | Answered |
 * | --- | --- |
 * | anonymous | 401, no body — before the object is loaded |
 * | `load` answers `null` | 404, no body |
 * | a denial | 403, no body |
 * | allowed | the route runs, `c.var.object` set |
 *
 * **A failure throws**, as everywhere: a store that cannot answer is
 * `STORE_FAILED`, never a 403 — `janusErrors()` answers it 503.
 */
export function permission<
	C extends ModelConfig,
	const T extends ObjectTypeOf<C>,
	const P extends CheckableOf<C, T>,
	O extends ObjectData<C, T>,
>(
	access: Pick<Permissions<C>, 'can'>,
	permission: P,
	type: T,
	load: (c: Context) => Awaitable<O | null>,
	...options: OptionsArgs<C, T, P, O>
): MiddlewareHandler<{
	// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
	Variables: { object: O };
}>;
export function permission(
	access: { readonly can: unknown },
	permission: string,
	type: string,
	load: (c: Context) => Awaitable<{ readonly id: string } | null>,
	options: {
		readonly subject?: (
			c: Context,
		) => Awaitable<SubjectRef<ModelConfig> | null>;
		readonly ctx?: (c: Context, object: unknown) => Awaitable<unknown>;
	} = {},
): MiddlewareHandler {
	const can = access.can as LooseCan;

	return async (c, next) => {
		const subject =
			options.subject === undefined ? userOf(c) : await options.subject(c);
		if (subject === null) return c.body(null, 401);

		const object = await load(c);
		if (object === null) return c.body(null, 404);

		const allowed = await can(
			subject,
			permission,
			{ ...object, type },
			options.ctx === undefined
				? undefined
				: { ctx: await options.ctx(c, object) },
		);
		if (!allowed) return c.body(null, 403);

		c.set('object', object);
		await next();
	};
}

/** `c.var.user`, which `session()` sets — or a wiring error when nothing did. */
function userOf(c: Context): SubjectRef<ModelConfig> | null {
	const user: unknown = c.get('user');
	if (user === undefined) {
		throw new TypeError(
			'permission(): c.var.user is not set — put session(auth) before it, or pass { subject }',
		);
	}
	return user as SubjectRef<ModelConfig> | null;
}
