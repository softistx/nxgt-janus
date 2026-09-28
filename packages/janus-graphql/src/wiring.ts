/**
 * The types of what `@permission` takes from `useJanus()` beside `access`:
 * `loaders`, the objects it checks by id, and `conditions`, the `ctx` a
 * condition tests. Typed from the model `access` was built on. Nothing here
 * runs.
 */

import type {
	CheckableOf,
	CtxOf,
	FieldsOf,
	ModelConfig,
	ObjectRef,
	ObjectTypeOf,
	PermissionModel,
} from '@nxgt/janus/permissions';

type Awaitable<V> = V | Promise<V>;

/** The model configuration of a `permissions()` instance; `never` for anything else. */
export type ModelConfigOf<P> = P extends {
	readonly model: PermissionModel<infer C>;
}
	? C
	: never;

/**
 * An object of type `T` as a loader answers it: its id, **every field a
 * `fromField` of its type reads**, and whatever else it carries.
 */
export type LoadedObject<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

/** Every condition any permission of `T` reaches, as one `ctx`; `never` when none does. */
export type ConditionCtxOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
> = CtxOf<C, T, CheckableOf<C, T>>;

// Declared as methods, whose parameters TypeScript compares both ways: a
// loader may then annotate `ctx` with the application's whole context.
type Loader<C extends ModelConfig, T extends ObjectTypeOf<C>, Ctx> = {
	load(id: string, ctx: Ctx): Awaitable<LoadedObject<C, T> | null>;
}['load'];

type Condition<C extends ModelConfig, T extends ObjectTypeOf<C>, Ctx> = {
	condition(object: ObjectRef<C, T>, ctx: Ctx): Awaitable<ConditionCtxOf<C, T>>;
}['condition'];

/**
 * `useJanus({ loaders })`: per object type, the object whose id a request
 * names, or `null` when there is none — answered `NOT_FOUND`. Required for a
 * type with a `fromField` whose id `@permission` reads from `args`.
 */
export type Loaders<C extends ModelConfig, Ctx> = {
	readonly [T in ObjectTypeOf<C>]?: Loader<C, T, Ctx>;
};

/**
 * `useJanus({ conditions })`: per object type whose permissions reach a
 * `when()`, the `ctx` it tests, from the object and the request's context.
 */
export type Conditions<C extends ModelConfig, Ctx> = {
	readonly [T in ObjectTypeOf<C> as [ConditionCtxOf<C, T>] extends [never]
		? never
		: T]?: Condition<C, T, Ctx>;
};

/** The options `@permission` reads, typed from `access`; absent without it. */
export type PermissionWiringOf<P, Ctx> = [ModelConfigOf<P>] extends [never]
	? { readonly loaders?: never; readonly conditions?: never }
	: {
			/** The objects `@permission` checks by id — see {@link Loaders}. */
			readonly loaders?: Loaders<ModelConfigOf<P>, Ctx>;
			/** The `ctx` of the conditions `@permission` reaches — see {@link Conditions}. */
			readonly conditions?: Conditions<ModelConfigOf<P>, Ctx>;
		};
