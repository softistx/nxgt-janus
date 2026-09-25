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

import type { CursorPage } from '../pagination/cursor-page';
import { type ResolvedModel, resolveModel } from './resolve';

// ─── The two building blocks ──────────────────────────────────────────────

/**
 * The ids of the objects whose field names this subject id — what `list()`
 * needs to reverse a `fromField`: `(doctorId) => db.records.ids({ doctorId })`.
 * Unpaged; a failure throws, as a store's does.
 */
export type Lookup = (subjectId: string) => Promise<readonly string[]>;

/**
 * A relation read from the object's own data: `fromField('doctorId', 'staff')`
 * holds for the subject of type `staff` whose id is `object.doctorId`.
 *
 * Nothing is stored. `can()` receives the object — the route has already
 * loaded it — and the compiler requires the field on it. `list()` cannot read
 * a field of objects it has not found yet, so it asks `lookup` instead; a
 * `list()` that would need one it was not given is a compile error.
 */
export interface FromField<
	Field extends string = string,
	Subject extends string = string,
> {
	readonly kind: 'fromField';
	readonly field: Field;
	readonly subject: Subject;
	readonly lookup?: Lookup;
}

/** A `fromField` `list()` can reverse. */
export interface ReversibleFromField<
	Field extends string = string,
	Subject extends string = string,
> extends FromField<Field, Subject> {
	readonly lookup: Lookup;
}

export function fromField<
	const Field extends string,
	const Subject extends string,
>(field: Field, subject: Subject): FromField<Field, Subject>;
export function fromField<
	const Field extends string,
	const Subject extends string,
>(
	field: Field,
	subject: Subject,
	options: { readonly lookup: Lookup },
): ReversibleFromField<Field, Subject>;
export function fromField(
	field: string,
	subject: string,
	options?: { readonly lookup: Lookup },
): FromField {
	return Object.freeze(
		options === undefined
			? { kind: 'fromField' as const, field, subject }
			: { kind: 'fromField' as const, field, subject, lookup: options.lookup },
	);
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

/** The relations of `T` that are stored as tuples: every one but its `fromField`s. */
type StoredRelationsOf<Ts, T> = {
	[R in RelationsOf<Ts, T>]: RelationDefOf<Ts, T, R> extends FromField
		? never
		: R;
}[RelationsOf<Ts, T>];

/**
 * `'team#member'` for every stored relation of every object type. Not a
 * `fromField`: a subject set reaches objects nobody passed to `can()`, so there
 * is no data to read the field from.
 */
type SubjectSetOf<Ts> = {
	[T in keyof Ts & string]: `${T}#${StoredRelationsOf<Ts, T>}`;
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

// ─── What list() can reverse ──────────────────────────────────────────────

/** `'record.doctor'` when relation `R` of `T` is a `fromField` with no `lookup`. */
type GapOfRelation<Ts, T, R> =
	RelationDefOf<Ts, T, R> extends { readonly lookup: Lookup }
		? never
		: RelationDefOf<Ts, T, R> extends FromField
			? `${T & string}.${R & string}`
			: never;

type GapOfName<Ts, T, N, Seen> = N extends `${infer R}->${infer P}`
	?
			| GapOfRelation<Ts, T, R>
			| GapOfPermission<Ts, ArrowTargets<Ts, T, R>, P, Seen>
	: GapOfPermission<Ts, T, N, Seen>;

/**
 * The `fromField`s without a `lookup` that `list(…, P, T)` would have to
 * reverse — through `P`'s rules, the names they reach, and arrows. A subject
 * set never reaches one: `defineModel` refuses that.
 */
type GapOfPermission<Ts, T, P, Seen> = T extends keyof Ts & string
	? P extends string
		? `${T}.${P}` extends Seen
			? never
			: P extends RelationsOf<Ts, T>
				? GapOfRelation<Ts, T, P>
				: Ts[T] extends { readonly permissions: infer Ps }
					? P extends keyof Ps
						? Ps[P] extends readonly (infer E)[]
							? GapOfName<Ts, T, NameOfRule<E>, Seen | `${T}.${P}`>
							: never
						: never
					: never
		: never
	: never;

/** Every `fromField` without a `lookup` that `list(…, P, T)` would reach; `never` when none. */
export type LookupGap<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = GapOfPermission<TypesOf<C>, T, P, never>;

/** What a permission must also be for `list()`: reversible. */
type ListCheck<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = [LookupGap<C, T, P>] extends [never]
	? unknown
	: Refusal<
			`list cannot reverse ${LookupGap<C, T, P>}: give that fromField a lookup`,
			never
		>;

/** Where a page of `list()` starts, and how much it holds. */
export interface ListPage {
	/** The `nextCursor` of the previous page; absent or `null` for the first. */
	readonly after?: string | null;
	/** Between 1 and 100; 20 when absent. */
	readonly limit?: number;
}

/** `CheckArgs`, with a page. */
type ListArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> =
	CheckArgs<C, T, P> extends [infer O]
		? [options: O & ListPage]
		: CheckArgs<C, T, P> extends [options?: infer O]
			? [options?: O & ListPage]
			: never;

/**
 * The signature of `list()`: the ids of the objects of `type` on which
 * `subject` holds `permission`, in ascending order, by pages. Typed like
 * `can()`, and refuses a permission that reaches a `fromField` with no
 * `lookup`: nothing could find the objects whose field names the subject.
 */
export type List<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	P extends CheckableOf<C, T>,
>(
	subject: SubjectRef<C> | null,
	permission: P & ListCheck<C, T, P>,
	type: T,
	...options: ListArgs<C, T, P>
) => Promise<CursorPage<string>>;

/** The relations of an object type that `grant` can write: not its `fromField`s. */
export type GrantableOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
> = StoredRelationsOf<TypesOf<C>, T>;

/**
 * Who may be granted relation `R` on an object of type `T`: an entity of each
 * subject type it names, and a subject set for each set it names.
 */
export type HolderOf<C extends ModelConfig, T extends ObjectTypeOf<C>, R> =
	RelationDefOf<TypesOf<C>, T, R> extends readonly (infer E)[]
		? E extends `${infer SetType}#${infer SetRelation}`
			? {
					readonly type: SetType;
					readonly id: string;
					readonly relation: SetRelation;
				}
			: { readonly type: E; readonly id: string }
		: never;

/** Writes one tuple, or removes it: typed like `can()`. */
export type Grant<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	R extends GrantableOf<C, T>,
>(
	object: { readonly type: T; readonly id: string },
	relation: R,
	subject: HolderOf<C, T, R>,
) => Promise<void>;

/** What `permissions()` answers. */
export interface Permissions<C extends ModelConfig> {
	readonly model: PermissionModel<C>;
	/**
	 * Whether `subject` holds `permission` on `object`: `true` or `false`, and
	 * **a failure throws** — a store that cannot answer is `STORE_FAILED`, never
	 * a denial. `null` is anonymous, and `false` before any store call.
	 */
	readonly can: Can<C>;
	/**
	 * The ids of the objects of `type` on which `subject` holds `permission`,
	 * ascending, by pages — what `can()` answers `true` for, found without
	 * naming them. `null` is anonymous, and an empty page before any store call.
	 * A failure throws, as for `can()`.
	 */
	readonly list: List<C>;
	/** Stores that `subject` holds `relation` on `object`. Idempotent. */
	readonly grant: Grant<C>;
	/** Removes it. Idempotent: revoking what is not held is not an error. */
	readonly revoke: Grant<C>;
}

/** The configuration a model was defined from. */
export type ConfigOf<M> = M extends PermissionModel<infer C> ? C : never;

// ─── The checks, as types ─────────────────────────────────────────────────

type Refusal<Text extends string, Expected> = {
	readonly [K in Text]: Expected;
};

/**
 * What `defineModel` offers and accepts for each object type, given the
 * subject types `S` and every object type `Ts`: the constraint of its `types`.
 *
 * **A constraint, so that an editor completes it.** The names a relation, a
 * rule, a `fromField` or a `when` may take are unions of literals here, and an
 * editor reads a type parameter's constraint to offer them — `'patient'`,
 * `'team#member'`, `'team->view'`. A check intersected into the parameter
 * instead (`C & Checked<C>`) refuses the same mistakes, but meets the literal
 * being typed and completes nothing: measured with the language service.
 *
 * A wrong name is unassignable **on that name**, and the error lists the ones
 * it could have been.
 */
/**
 * The same names, spelled out: a union the compiler prints as its members —
 * `"patient" | "staff" | "team#member"` — rather than as the alias that
 * computed it, so an error lists what the name could have been.
 */
type Spelled<U> = [U] extends [infer V extends string]
	? { [K in V]: K }[V]
	: never;

export type ModelTypesOf<S extends string, Ts> = {
	readonly [T in keyof Ts]: {
		readonly relations?: {
			readonly [name: string]:
				| readonly Spelled<SubjectRefOf<S, Ts>>[]
				| FromField<string, Spelled<S | (keyof Ts & string)>>;
		};
		readonly permissions?: {
			readonly [P in PermissionsOf<Ts, T>]: P extends RelationsOf<Ts, T>
				? Refusal<
						`"${P}" names a relation and a permission of ${T & string}; rename one`,
						never
					>
				: readonly (
						| Spelled<RuleRefOf<Ts, T>>
						| When<Spelled<RuleRefOf<Ts, T>>, never>
					)[];
		};
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
export function defineModel<
	const S extends string,
	const Ts extends ModelConfig['types'] & ModelTypesOf<S, Ts>,
>(config: {
	readonly subjects: readonly S[];
	readonly types: Ts;
}): PermissionModel<{ readonly subjects: readonly S[]; readonly types: Ts }>;
export function defineModel<const C extends ModelConfig>(
	config: C,
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
