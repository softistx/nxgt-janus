/**
 * The permission model: which object types exist, which relations they hold,
 * and which permissions those relations grant — written in TypeScript, and
 * typed from itself.
 *
 * **ReBAC, embedded.** Zanzibar's data model — relations between objects and
 * subjects, permissions computed from them — without its infrastructure: the
 * database is the application's own, so reads follow writes and there is
 * nothing to cache or sequence. Two things go beyond Zanzibar's descendants:
 *
 * - **`fromField`**, a relation read from the object's own data — a record's
 *   `doctorId` — rather than a tuple to keep in sync with it. Two sources of
 *   truth for one fact is the first trap of a Zanzibar deployment;
 * - **`when`**, a condition written in TypeScript and typed: its `ctx` is what
 *   `can()` then requires, and only for the permissions whose rules reach it.
 *
 * The model is a flat `const` literal, and everything the compiler can check
 * about it is checked here: a relation naming a subject type that does not
 * exist, a permission naming a relation that does not exist, an arrow to a
 * permission its target does not have. What only running it can check —
 * names, cycles — is refused by {@link defineModel} with a `TypeError`.
 */

import { type ResolvedModel, resolveModel } from './resolve';

// ─── The two building blocks ──────────────────────────────────────────────

/**
 * A relation read from the object's own data: `fromField('doctorId', 'staff')`
 * holds for the subject of type `staff` whose id is `object.doctorId`.
 *
 * Nothing is stored. `can()` receives the object — the route has already
 * loaded it — and the compiler requires the field on it.
 */
export interface FromField<
	Field extends string = string,
	Subject extends string = string,
> {
	readonly kind: 'fromField';
	readonly field: Field;
	readonly subject: Subject;
}

export function fromField<
	const Field extends string,
	const Subject extends string,
>(field: Field, subject: Subject): FromField<Field, Subject> {
	return Object.freeze({ kind: 'fromField', field, subject });
}

/**
 * A rule that grants only when `test(ctx)` is true: `when('doctor', (ctx:
 * { onShift: boolean }) => ctx.onShift)`.
 *
 * `rule` is any rule of the same object type — a relation, a permission, an
 * arrow. The test is synchronous and pure: it decides on what the caller
 * passes, and reads nothing, so it can never fail the way a store can.
 */
export interface When<Rule extends string = string, Ctx = never> {
	readonly kind: 'when';
	readonly rule: Rule;
	readonly test: (ctx: Ctx) => boolean;
}

export function when<const Rule extends string, Ctx>(
	rule: Rule,
	test: (ctx: Ctx) => boolean,
): When<Rule, Ctx> {
	return Object.freeze({ kind: 'when', rule, test });
}

// ─── The shape of a model ─────────────────────────────────────────────────

/**
 * Who may hold a relation: subject types — `'staff'`, a user type, or `'team'`,
 * an object type — and subject sets, `'team#member'`: every member of a team.
 * Or a relation read from the object's data.
 */
export type RelationDef = readonly string[] | FromField;

/**
 * One way to hold a permission: a relation or a permission of the same object
 * type (`'doctor'`, `'manage'`), an arrow to a permission of a related object
 * (`'team->view'`: who can view the record's team), or one of those under a
 * condition.
 */
export type RuleDef = string | When<string, never>;

export interface ObjectTypeDef {
	readonly relations?: { readonly [name: string]: RelationDef };
	/** Each permission is the union of its rules. */
	readonly permissions?: { readonly [name: string]: readonly RuleDef[] };
}

export interface ModelConfig {
	/**
	 * The user types that can be subjects — pass `auth.types` from `janus()`,
	 * so a user type and a subject type are one name.
	 */
	readonly subjects: readonly string[];
	readonly types: { readonly [name: string]: ObjectTypeDef };
}

// ─── Reading a model's types ──────────────────────────────────────────────

type TypesOf<C extends ModelConfig> = C['types'];

/** The object types a model declares. */
export type ObjectTypeOf<C extends ModelConfig> = keyof TypesOf<C> & string;

/** The user types a model accepts as subjects. */
export type UserTypeOf<C extends ModelConfig> = C['subjects'][number];

type RelationsOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly relations: infer R }
		? keyof R & string
		: never
	: never;

type PermissionsOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly permissions: infer P }
		? keyof P & string
		: never
	: never;

type NamesOf<Ts, T> = RelationsOf<Ts, T> | PermissionsOf<Ts, T>;

type RelationDefOf<Ts, T, R> = T extends keyof Ts
	? Ts[T] extends { readonly relations: infer Rs }
		? R extends keyof Rs
			? Rs[R]
			: never
		: never
	: never;

/** `'team#member'` for every relation of every object type. */
type SubjectSetOf<Ts> = {
	[T in keyof Ts & string]: `${T}#${RelationsOf<Ts, T>}`;
}[keyof Ts & string];

type SubjectRefOf<S extends string, Ts> =
	| S
	| (keyof Ts & string)
	| SubjectSetOf<Ts>;

/** The object types an arrow through `R` reaches: its direct subject types. */
type ArrowTargets<Ts, T, R> =
	RelationDefOf<Ts, T, R> extends FromField<string, infer Sub>
		? Sub
		: RelationDefOf<Ts, T, R> extends readonly (infer E)[]
			? E extends `${string}#${string}`
				? never
				: E
			: never;

/** The names every one of `Targets` declares. */
type CommonNames<Ts, Targets> =
	NamesOf<Ts, Targets> extends infer N
		? N extends string
			? [Targets] extends [TypesNaming<Ts, N>]
				? N
				: never
			: never
		: never;

type TypesNaming<Ts, N> = {
	[X in keyof Ts]: N extends NamesOf<Ts, X> ? X : never;
}[keyof Ts];

/** `'team->view'`, for each relation whose targets are all object types. */
type ArrowsOf<Ts, T> = {
	[R in RelationsOf<Ts, T>]: [ArrowTargets<Ts, T, R>] extends [never]
		? never
		: [ArrowTargets<Ts, T, R>] extends [keyof Ts]
			? `${R}->${CommonNames<Ts, ArrowTargets<Ts, T, R>>}`
			: never;
}[RelationsOf<Ts, T>];

/** Every string a rule of `T` may be. */
type RuleRefOf<Ts, T> = NamesOf<Ts, T> | ArrowsOf<Ts, T>;

/** What `can()` accepts for an object type: its relations and its permissions. */
export type CheckableOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
> = NamesOf<TypesOf<C>, T>;

/** The fields an object of type `T` must carry: those its `fromField`s read. */
export type FieldsOf<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	[R in RelationsOf<TypesOf<C>, T>]: RelationDefOf<
		TypesOf<C>,
		T,
		R
	> extends FromField<infer F, string>
		? F
		: never;
}[RelationsOf<TypesOf<C>, T>];

/**
 * An object, as `can()` takes it: its type and id, and **every field a
 * `fromField` of its type reads** — required, so an object passed without
 * them is a compile error rather than a silent denial. `null` is a field
 * holding nobody.
 */
export type ObjectRef<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly type: T;
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

/** A subject: a user from `janus()` as it is, or an object. */
export interface SubjectRef<C extends ModelConfig> {
	readonly type: UserTypeOf<C> | ObjectTypeOf<C>;
	readonly id: string;
}

// ─── The context a check requires ─────────────────────────────────────────

type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;

type CtxOfRule<E> = E extends When<string, infer X> ? X : never;

type NameOfRule<E> = E extends string
	? E
	: E extends When<infer R, never>
		? R
		: never;

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
			: Ts[T] extends { readonly permissions: infer Ps }
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
			? Strict<C, T, P>
			: [options?: { readonly ctx?: unknown }]
	: [CheckableOf<C, T>] extends [P]
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

/** The configuration a model was defined from. */
export type ConfigOf<M> = M extends PermissionModel<infer C> ? C : never;

// ─── The checks, as types ─────────────────────────────────────────────────

type Refusal<Text extends string, Expected> = {
	readonly [K in Text]: Expected;
};

type CheckRelation<C extends ModelConfig, Def> =
	Def extends FromField<string, infer Sub>
		? Sub extends UserTypeOf<C> | ObjectTypeOf<C>
			? unknown
			: {
					readonly subject: Refusal<
						`"${Sub}" is not a subject type; name one of`,
						UserTypeOf<C> | ObjectTypeOf<C>
					>;
				}
		: {
				readonly [I in keyof Def]: Def[I] extends SubjectRefOf<
					UserTypeOf<C>,
					TypesOf<C>
				>
					? unknown
					: Refusal<
							`"${Def[I] & string}" is not a subject type or a subject set; name one of`,
							SubjectRefOf<UserTypeOf<C>, TypesOf<C>>
						>;
			};

type CheckRules<Ts, T, Rules> = {
	readonly [I in keyof Rules]: Rules[I] extends string
		? Rules[I] extends RuleRefOf<Ts, T>
			? unknown
			: Refusal<
					`"${Rules[I]}" is not a relation, a permission or an arrow of ${T & string}; name one of`,
					RuleRefOf<Ts, T>
				>
		: Rules[I] extends When<infer R, never>
			? R extends RuleRefOf<Ts, T>
				? unknown
				: {
						readonly rule: Refusal<
							`"${R}" is not a relation, a permission or an arrow of ${T & string}; name one of`,
							RuleRefOf<Ts, T>
						>;
					}
			: unknown;
};

type CheckObjectType<C extends ModelConfig, T> = (TypesOf<C>[T &
	keyof TypesOf<C>] extends { readonly relations: infer Rs }
	? {
			readonly relations: {
				readonly [R in keyof Rs]: CheckRelation<C, Rs[R]>;
			};
		}
	: unknown) &
	(TypesOf<C>[T & keyof TypesOf<C>] extends { readonly permissions: infer Ps }
		? {
				readonly permissions: {
					readonly [P in keyof Ps]: P extends RelationsOf<TypesOf<C>, T>
						? Refusal<
								`"${P & string}" names a relation and a permission of ${T & string}; rename one`,
								never
							>
						: CheckRules<TypesOf<C>, T, Ps[P]>;
				};
			}
		: unknown);

/**
 * The compile-time checks `defineModel` intersects into its parameter — the
 * `C & Checked<C>` pattern of `janus()`: a wrong value is unassignable **on
 * the offending key**, and the reason is the type the compiler prints.
 */
export type CheckedModel<C extends ModelConfig> = {
	readonly types: {
		readonly [T in keyof TypesOf<C>]: CheckObjectType<C, T>;
	};
};

// ─── Defining one ─────────────────────────────────────────────────────────

/** A model, checked and resolved. What `permissions()` will take. */
export interface PermissionModel<C extends ModelConfig = ModelConfig> {
	/** The user types it accepts as subjects. */
	readonly subjects: readonly UserTypeOf<C>[];
	/** The object types it declares. */
	readonly types: readonly ObjectTypeOf<C>[];
	/** The definition, as written. Frozen. */
	readonly definition: C;
}

// Keyed by the frozen model itself: nothing outside this module can reach it.
const RESOLVED = new WeakMap<object, ResolvedModel>();

/**
 * Checks a model and resolves it. Connects to nothing.
 *
 * ```ts
 * export const model = defineModel({
 *   subjects: auth.types,
 *   types: {
 *     team: {
 *       relations: { member: ['staff', 'team#member'], lead: ['staff'] },
 *       permissions: { manage: ['lead'], view: ['member', 'manage'] },
 *     },
 *     record: {
 *       relations: {
 *         doctor: fromField('doctorId', 'staff'),
 *         team: ['team'],
 *       },
 *       permissions: {
 *         view: ['doctor', 'team->view'],
 *         edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
 *       },
 *     },
 *   },
 * });
 * ```
 *
 * Refuses with a `TypeError` what only running it can see: a name that is not
 * camelCase, an object type named like a user type, a permission that reaches
 * itself without crossing a relation — which no data could ever end.
 */
export function defineModel<const C extends ModelConfig>(
	config: C & CheckedModel<C>,
): PermissionModel<C> {
	const resolved = resolveModel(config, 'defineModel');
	const model: PermissionModel<C> = Object.freeze({
		subjects: [...resolved.subjects] as UserTypeOf<C>[],
		types: [...resolved.types.keys()] as ObjectTypeOf<C>[],
		definition: config,
	});
	RESOLVED.set(model, resolved);
	return model;
}

/** The resolved form of a model this module defined. Internal. */
export function resolvedOf(model: object): ResolvedModel {
	const resolved = RESOLVED.get(model);
	if (resolved === undefined) {
		throw new TypeError(
			'permissions: this model was not made by defineModel() — pass what defineModel() answered',
		);
	}
	return resolved;
}
