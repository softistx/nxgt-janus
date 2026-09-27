/** The context a check requires: every condition its rules can reach. */

import type { ModelConfig } from './config';
import type { ArrowTargets, NameOfRule, ObjectTypeOf, TypesOf } from './names';
import type { When } from './when';

export type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;

type CtxOfRule<E> = E extends When<string, infer X> ? X : never;

type CtxOfName<Ts, T, N, Seen> = N extends `${infer R}->${infer P}`
	? CtxOfPermission<Ts, ArrowTargets<Ts, T, R>, P, Seen>
	: CtxOfPermission<Ts, T, N, Seen>;

/**
 * The union of the `ctx` types a permission's rules reach — through its own
 * rules, the permissions they name, and arrows into other types. `Seen` stops
 * the walk on a cycle.
 */
type CtxOfPermission<Ts, T, P, Seen> = T extends keyof Ts & string
	? P extends string
		? `${T}.${P}` extends Seen
			? never
			: Ts[T] extends { readonly permits: infer Ps }
				? P extends keyof Ps
					? Ps[P] extends readonly (infer E)[]
						? CtxOfRule<E> | CtxOfName<Ts, T, NameOfRule<E>, Seen | `${T}.${P}`>
						: never
					: never
				: never
		: never
	: never;

/**
 * What `can(…, permission, object)` requires as `ctx`: every condition its
 * rules can reach, intersected. `never` when none — and then `can()` takes no
 * `ctx` at all.
 */
export type CtxOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = [CtxOfPermission<TypesOf<C>, T, P, never>] extends [never]
	? never
	: UnionToIntersection<CtxOfPermission<TypesOf<C>, T, P, never>>;
