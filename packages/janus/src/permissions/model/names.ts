/**
 * Reading a model's types: the names each object type declares, the subject
 * sets and arrows they make, and every string a rule may be.
 */

import type { ModelConfig } from './config';
import type { FromField } from './from-field';
import type { When } from './when';

export type TypesOf<C extends ModelConfig> = C['types'];

/** The object types a model declares. */
export type ObjectTypeOf<C extends ModelConfig> = keyof TypesOf<C> & string;

/** The user types a model accepts as subjects. */
export type UserTypeOf<C extends ModelConfig> = C['subjects'][number];

export type RelationsOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly related: infer R }
		? keyof R & string
		: never
	: never;

export type PermissionsOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly permits: infer P }
		? keyof P & string
		: never
	: never;

export type NamesOf<Ts, T> = RelationsOf<Ts, T> | PermissionsOf<Ts, T>;

export type RelationDefOf<Ts, T, R> = T extends keyof Ts
	? Ts[T] extends { readonly related: infer Rs }
		? R extends keyof Rs
			? Rs[R]
			: never
		: never
	: never;

/** The relations of `T` that are stored as tuples: every one but its `fromField`s. */
export type StoredRelationsOf<Ts, T> = {
	[R in RelationsOf<Ts, T>]: RelationDefOf<Ts, T, R> extends FromField
		? never
		: R;
}[RelationsOf<Ts, T>];

/**
 * `'team#members'` for every stored relation of every object type. Not a
 * `fromField`: a subject set reaches objects nobody passed to `can()`, so there
 * is no data to read the field from.
 */
export type SubjectSetOf<Ts> = {
	[T in keyof Ts & string]: `${T}#${StoredRelationsOf<Ts, T>}`;
}[keyof Ts & string];

export type SubjectRefOf<S extends string, Ts> =
	| S
	| (keyof Ts & string)
	| SubjectSetOf<Ts>;

/** The object types an arrow through `R` reaches: its direct subject types. */
export type ArrowTargets<Ts, T, R> =
	RelationDefOf<Ts, T, R> extends FromField<string, infer Sub>
		? Sub
		: RelationDefOf<Ts, T, R> extends readonly (infer E)[]
			? [Extract<E, `${string}#${string}`>] extends [never]
				? E
				: never
			: never;

/** The names every one of `Targets` declares. */
export type CommonNames<Ts, Targets> =
	NamesOf<Ts, Targets> extends infer N
		? N extends string
			? [Targets] extends [TypesNaming<Ts, N>]
				? N
				: never
			: never
		: never;

export type TypesNaming<Ts, N> = {
	[X in keyof Ts]: N extends NamesOf<Ts, X> ? X : never;
}[keyof Ts];

/** `'teams->view'`, for each relation whose targets are all object types. */
export type ArrowsOf<Ts, T> = {
	[R in RelationsOf<Ts, T>]: [ArrowTargets<Ts, T, R>] extends [never]
		? never
		: [ArrowTargets<Ts, T, R>] extends [keyof Ts]
			? `${R}->${CommonNames<Ts, ArrowTargets<Ts, T, R>>}`
			: never;
}[RelationsOf<Ts, T>];

/** Every string a rule of `T` may be. */
export type RuleRefOf<Ts, T> = NamesOf<Ts, T> | ArrowsOf<Ts, T>;

/** The name or arrow a rule refers to, with its `when` taken off. */
export type NameOfRule<E> = E extends string
	? E
	: E extends When<infer R, never>
		? R
		: never;
