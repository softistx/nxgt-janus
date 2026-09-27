/** The signature of `can()`, and the options a check requires. */

import type { ModelConfig } from './config';
import type { CtxOf } from './ctx';
import type { ObjectTypeOf } from './names';
import type { CheckableOf, ObjectRef, SubjectRef } from './refs';
import type { UnionToIntersection } from './unions';

/**
 * The options of a check: `ctx` required exactly when a condition is
 * reachable.
 *
 * Loose when `T` or `P` is its whole constraint — what the compiler falls back
 * to when the argument was wrong. Requiring `ctx` there would report a missing
 * argument instead of the wrong type or permission that caused it; the
 * refusal on that argument is the one worth reading. A `when` reached with no
 * `ctx` still throws at run time.
 */
export type CheckArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = [ObjectTypeOf<C>] extends [T]
	? [ObjectTypeOf<C>] extends [never]
		? [options?: { readonly ctx?: unknown }]
		: IsSingle<ObjectTypeOf<C>> extends true
			? // One object type: `T` is its constraint and right; `P` may not be.
				PermissionArgs<C, T, P>
			: [options?: { readonly ctx?: unknown }]
	: PermissionArgs<C, T, P>;

/** `CheckArgs` once `T` is known right: loose when `P` is its whole constraint. */
type PermissionArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = [CheckableOf<C, T>] extends [P]
	? IsSingle<CheckableOf<C, T>> extends true
		? Strict<C, T, P>
		: [options?: { readonly ctx?: unknown }]
	: Strict<C, T, P>;

type Strict<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = [CtxOf<C, T, P>] extends [never]
	? [options?: { readonly ctx?: never }]
	: [options: { readonly ctx: CtxOf<C, T, P> }];

/** Whether `U` is one type rather than a union of several. */
type IsSingle<U> = [U] extends [UnionToIntersection<U>] ? true : false;

/**
 * The signature of `can()`, typed from the model: the permission must be one
 * the object's type declares, the object must carry every field its
 * `fromField`s read, and `ctx` is required exactly when a condition is
 * reachable. `null` is anonymous, and answers `false`.
 */
export type Can<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	P extends CheckableOf<C, T>,
>(
	subject: SubjectRef<C> | null,
	permission: P,
	object: ObjectRef<C, T>,
	...options: CheckArgs<C, T, P>
) => Promise<boolean>;
