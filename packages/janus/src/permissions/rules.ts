/**
 * The types of the reference form; `./normalize` spells it out at run time.
 *
 * The model written the way Keto's OPL is: `related` and the names a type
 * `permits` declared on the type, the rules as functions given **typed
 * references** — `related.owners`, `permits.manage`,
 * `related.parents.permits.view` — instead of strings.
 *
 * ```ts
 * defineModel({
 *   subjects: auth.types,
 *   types: {
 *     folder:   { related: { owners: ['staff'] }, permits: ['view'] },
 *     document: { related: { owners: ['staff'], parents: ['folder'] }, permits: ['view', 'edit'] },
 *   },
 *   rules: {
 *     folder:   { view: ({ related }) => [related.owners] },
 *     document: {
 *       view: ({ related, permits }) => [related.owners, related.parents.permits.view, permits.edit],
 *       edit: ({ related }) => [when(related.owners, (ctx: { locked: boolean }) => !ctx.locked)],
 *     },
 *   },
 * });
 * ```
 *
 * **A rule declares; it never runs a check.** `defineModel` calls each rule
 * function once, with references, and turns what it returns into the string
 * form — `'owners'`, `'parents->view'` — that the rest of the package reads.
 * The two forms are one model: a type written with `relations` and
 * `permissions` strings and one written with `related`, `permits` and
 * `rules` can share a model, and the string form is not going away.
 *
 * **Why the names are declared on the type and the rules beside it.** A rule
 * function is context-sensitive, and TypeScript infers nothing from a literal
 * that holds one until it knows the parameter's type; a function inside
 * `types` would therefore type its own `related` as `any`. Measured, with the
 * self-referential constraint and with an intersection alike. Declared first,
 * the names type the rules — including `permits.manage` inside `view`, and
 * the arrows into other types.
 */

import type {
	ArrowTargets,
	PermissionsOf,
	RelationsOf,
	RuleRefOf,
	Spelled,
	When,
} from './model';

// ─── References ───────────────────────────────────────────────────────────

/** A relation of the type the rule belongs to: `related.owners`. */
export interface RelationRef<
	T extends string = string,
	R extends string = string,
> {
	readonly kind: 'relation';
	readonly type: T;
	readonly name: R;
}

/** A permission of the same type: `permits.manage`. Never the one being defined. */
export interface PermissionRef<
	T extends string = string,
	P extends string = string,
> {
	readonly kind: 'permission';
	readonly type: T;
	readonly name: P;
}

/**
 * An arrow: whoever holds `permission` — or the relation — on the object a
 * relation reaches: `related.parents.permits.view`, `related.teams.related.leads`.
 */
export interface ArrowRef<
	R extends string = string,
	P extends string = string,
> {
	readonly kind: 'arrow';
	readonly relation: R;
	readonly permission: P;
}

export type Ref = RelationRef | PermissionRef | ArrowRef;

/** One element a rule function returns: a reference, or a `when` on one. */
export type RuleRef = Ref | When<string, never>;

/** The string form of a reference, as the string rules spell it. */
export type NameOfRef<R> =
	R extends ArrowRef<infer Rel, infer P>
		? `${Rel}->${P}`
		: R extends RelationRef<string, infer N>
			? N
			: R extends PermissionRef<string, infer N>
				? N
				: never;

// ─── The typed parameter of a rule ────────────────────────────────────────

// The names of a type, in either form, and the object types an arrow reaches,
// are model.ts's: one reading of `types` for the string form and this one.
type PermitsOf<Ts, T> = PermissionsOf<Ts, T>;

/** The names every one of `Targets` declares — what an arrow may reach. */
type Common<Ts, Targets, N> = N extends string
	? [Targets] extends [
			{
				[X in keyof Ts]: N extends PermitsOf<Ts, X> | RelationsOf<Ts, X>
					? X
					: never;
			}[keyof Ts],
		]
		? N
		: never
	: never;

/** `related.x.permits.p` and `related.x.related.r`, when every holder of `x` is an object type. */
type Through<Ts, T, R extends string> = [ArrowTargets<Ts, T, R>] extends [never]
	? unknown
	: [ArrowTargets<Ts, T, R>] extends [keyof Ts]
		? {
				readonly permits: {
					readonly [P in Common<
						Ts,
						ArrowTargets<Ts, T, R>,
						PermitsOf<Ts, ArrowTargets<Ts, T, R>>
					>]: ArrowRef<R, P>;
				};
				readonly related: {
					readonly [X in Common<
						Ts,
						ArrowTargets<Ts, T, R>,
						RelationsOf<Ts, ArrowTargets<Ts, T, R>>
					>]: ArrowRef<R, X>;
				};
			}
		: unknown;

/** What a rule of permission `Self` of type `T` is given. */
export type RuleParam<Ts, T extends string, Self extends string> = {
	readonly related: {
		readonly [R in RelationsOf<Ts, T>]: RelationRef<T, R> & Through<Ts, T, R>;
	};
	readonly permits: {
		readonly [P in Exclude<PermitsOf<Ts, T>, Self>]: PermissionRef<T, P>;
	};
};

/**
 * One element a rule of permission `P` of `T` may answer: a reference, or a
 * `when` on a name the string form would accept there — never `P` itself.
 */
type RuleOf<Ts, T, P> =
	| Ref
	| When<Spelled<Exclude<RuleRefOf<Ts, T>, P>>, never>;

/**
 * What `rules` accepts, given `types`: one function per declared permit of
 * each type that declares some, typed from the names declared on the types.
 * A constraint, so an editor completes `related.` and `permits.` inside.
 */
export type RulesOf<Ts> = {
	readonly [T in keyof Ts & string as Ts[T] extends {
		readonly permits: readonly string[];
	}
		? T
		: never]: {
		readonly [P in PermitsOf<Ts, T>]: (
			param: RuleParam<Ts, T, P>,
		) => readonly [RuleOf<Ts, T, P>, ...RuleOf<Ts, T, P>[]];
	};
};

/**
 * The types written in the reference form — with `related` or `permits` — and
 * those that declare `permits`, which `rules` must then cover.
 */
export type ReferenceTypesOf<Ts> = {
	[T in keyof Ts]: Ts[T] extends { readonly related: unknown }
		? T
		: Ts[T] extends { readonly permits: unknown }
			? T
			: never;
}[keyof Ts];

export type PermitTypesOf<Ts> = {
	[T in keyof Ts]: Ts[T] extends {
		readonly permits: readonly [string, ...string[]];
	}
		? T
		: never;
}[keyof Ts];

/**
 * What `rules` may not hold, checked on `Rs` itself: a rule for a permit its
 * type does not declare, or for a type that declares none — refused on that
 * key, so the fix is where the mistake is.
 */
export type RulesOnly<Ts, Rs> = {
	readonly [T in keyof Rs]: T extends keyof Ts
		? Ts[T] extends { readonly permits: readonly string[] }
			? {
					readonly [P in keyof Rs[T]]: P extends PermitsOf<Ts, T>
						? unknown
						: {
								readonly [K in `rules.${T & string}.${P & string} is not in types.${T & string}.permits`]: never;
							};
				}
			: {
					readonly [K in `rules.${T & string}: types.${T & string} declares no permits`]: never;
				}
		: {
				readonly [K in `rules.${T & string}: no object type named ${T & string}`]: never;
			};
};

// ─── The two forms, made one ──────────────────────────────────────────────

type NormalizedRule<E> =
	E extends ArrowRef<infer R, infer P>
		? `${R}->${P}`
		: E extends RelationRef<string, infer N>
			? N
			: E extends PermissionRef<string, infer N>
				? N
				: E;

type NormalizedRules<F> = F extends (param: never) => readonly (infer E)[]
	? readonly NormalizedRule<E>[]
	: never;

type NormalizedType<D, Rs> = (D extends { readonly related: infer R }
	? { readonly relations: R }
	: D extends { readonly relations: infer R }
		? { readonly relations: R }
		: unknown) &
	(D extends { readonly permits: readonly (infer P extends string)[] }
		? {
				readonly permissions: {
					readonly [K in P]: K extends keyof Rs
						? NormalizedRules<Rs[K]>
						: never;
				};
			}
		: D extends { readonly permissions: infer Ps }
			? { readonly permissions: Ps }
			: unknown);

/**
 * A configuration in the string form, whichever form it was written in:
 * what every type reading a model — `Can`, `CtxOf`, `HolderOf` — is given.
 */
export type Normalized<C> = C extends {
	readonly subjects: infer S;
	readonly types: infer Ts;
}
	? {
			readonly subjects: S;
			readonly types: {
				readonly [T in keyof Ts]: NormalizedType<
					Ts[T],
					C extends { readonly rules: infer Rs }
						? T extends keyof Rs
							? Rs[T]
							: unknown
						: unknown
				>;
			};
		}
	: C;
