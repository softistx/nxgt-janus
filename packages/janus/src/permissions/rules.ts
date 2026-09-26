/**
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

import type { FromField, ModelConfig, When } from './model';

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

type RelatedOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly related: infer R }
		? R
		: Ts[T] extends { readonly relations: infer R }
			? R
			: never
	: never;

/** The permission names an object type declares, in either form. */
type PermitsOf<Ts, T> = T extends keyof Ts
	? Ts[T] extends { readonly permits: readonly (infer P extends string)[] }
		? P
		: Ts[T] extends { readonly permissions: infer Ps }
			? keyof Ps & string
			: never
	: never;

/**
 * The object types the holders of relation `R` of `T` name — and none when
 * one holder is a subject set, which `defineModel` refuses an arrow through.
 */
type TargetsOf<Ts, T, R> = R extends keyof RelatedOf<Ts, T>
	? RelatedOf<Ts, T>[R] extends FromField<string, infer Sub>
		? Sub
		: RelatedOf<Ts, T>[R] extends readonly (infer E)[]
			? [Extract<E, `${string}#${string}`>] extends [never]
				? E
				: never
			: never
	: never;

/** The names every one of `Targets` declares — what an arrow may reach. */
type Common<Ts, Targets, N> = N extends string
	? [Targets] extends [
			{
				[X in keyof Ts]: N extends
					| PermitsOf<Ts, X>
					| (keyof RelatedOf<Ts, X> & string)
					? X
					: never;
			}[keyof Ts],
		]
		? N
		: never
	: never;

/** `related.x.permits.p` and `related.x.related.r`, when every holder of `x` is an object type. */
type Through<Ts, T, R extends string> = [TargetsOf<Ts, T, R>] extends [never]
	? unknown
	: [TargetsOf<Ts, T, R>] extends [keyof Ts]
		? {
				readonly permits: {
					readonly [P in Common<
						Ts,
						TargetsOf<Ts, T, R>,
						PermitsOf<Ts, TargetsOf<Ts, T, R>>
					>]: ArrowRef<R, P>;
				};
				readonly related: {
					readonly [X in Common<
						Ts,
						TargetsOf<Ts, T, R>,
						keyof RelatedOf<Ts, TargetsOf<Ts, T, R>> & string
					>]: ArrowRef<R, X>;
				};
			}
		: unknown;

/** What a rule of permission `Self` of type `T` is given. */
export type RuleParam<Ts, T extends string, Self extends string> = {
	readonly related: {
		readonly [R in keyof RelatedOf<Ts, T> & string]: RelationRef<T, R> &
			Through<Ts, T, R>;
	};
	readonly permits: {
		readonly [P in Exclude<PermitsOf<Ts, T>, Self>]: PermissionRef<T, P>;
	};
};

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
		) => readonly RuleRef[];
	};
};

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

// ─── At run time ──────────────────────────────────────────────────────────

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

const isRef = (value: unknown): value is Ref =>
	isRecord(value) &&
	(value.kind === 'relation' ||
		value.kind === 'permission' ||
		value.kind === 'arrow');

/** The string form of a reference: `owners`, `manage`, `parents->view`. */
export function nameOfRef(ref: Ref): string {
	return ref.kind === 'arrow' ? `${ref.relation}->${ref.permission}` : ref.name;
}

/** A configuration as JavaScript hands it: every key read before it is trusted. */
const raw = (config: ModelConfig): Record<string, unknown> =>
	config as unknown as Record<string, unknown>;

/** Whether a configuration uses the reference form anywhere. */
export function hasRules(model: ModelConfig): boolean {
	const config = raw(model);
	if (config.rules !== undefined) return true;
	return (
		isRecord(config.types) &&
		Object.values(config.types).some(
			(def) =>
				isRecord(def) &&
				(def.related !== undefined || def.permits !== undefined),
		)
	);
}

/**
 * The string form of a configuration written with `related`, `permits` and
 * `rules`: each rule function called once, with references, and what it
 * answers spelled out. A type written with strings passes through as it is.
 * Every refusal is a `TypeError` naming where it is, as `resolveModel`'s.
 */
export function normalizeRules(model: ModelConfig, where: string): ModelConfig {
	const config = raw(model);
	const refuse = (message: string) => new TypeError(`${where}: ${message}`);
	const types = config.types;
	if (!isRecord(types)) throw refuse('types declares no object type');
	const rules = config.rules;
	if (rules !== undefined && !isRecord(rules)) {
		throw refuse(
			'rules must be an object: one entry per type that declares permits',
		);
	}

	// The names first: an arrow reaches names of a type declared further down.
	const related = new Map<string, Record<string, unknown>>();
	const permits = new Map<string, readonly string[]>();
	const stringForm = new Set<string>();
	for (const [name, def] of Object.entries(types)) {
		const at = `types.${name}`;
		if (!isRecord(def)) throw refuse(`${at} must be an object`);
		if (def.relations !== undefined && def.related !== undefined) {
			throw refuse(`${at} has both relations and related. Pass one.`);
		}
		if (def.permissions !== undefined && def.permits !== undefined) {
			throw refuse(`${at} has both permissions and permits. Pass one.`);
		}
		const relations = def.related ?? def.relations;
		if (relations !== undefined && !isRecord(relations)) {
			throw refuse(
				`${at}.${def.related === undefined ? 'relations' : 'related'} must be an object`,
			);
		}
		related.set(name, relations ?? {});
		if (def.permits !== undefined) {
			if (
				!Array.isArray(def.permits) ||
				!def.permits.every((permit) => typeof permit === 'string')
			) {
				throw refuse(`${at}.permits must be an array of permission names`);
			}
			const names = def.permits as string[];
			const seen = new Set<string>();
			for (const permit of names) {
				if (seen.has(permit))
					throw refuse(`${at}.permits names "${permit}" twice`);
				seen.add(permit);
			}
			permits.set(name, names);
		} else {
			stringForm.add(name);
			permits.set(
				name,
				isRecord(def.permissions) ? Object.keys(def.permissions) : [],
			);
		}
	}

	for (const name of Object.keys(rules ?? {})) {
		if (!types[name])
			throw refuse(`rules.${name}: no object type named "${name}"`);
		if (stringForm.has(name)) {
			throw refuse(
				`rules.${name}: types.${name} writes its permissions as strings; rules is for a type that declares permits`,
			);
		}
	}

	const normalizedTypes: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(types) as [
		string,
		Record<string, unknown>,
	][]) {
		if (stringForm.has(name)) {
			normalizedTypes[name] = def;
			continue;
		}
		const at = `types.${name}`;
		for (const key of Object.keys(def)) {
			if (key !== 'related' && key !== 'relations' && key !== 'permits') {
				throw refuse(
					`${at}.${key} is not a key of an object type: related or permits`,
				);
			}
		}
		const declared = permits.get(name) ?? [];
		const ofType = isRecord(rules?.[name])
			? (rules[name] as Record<string, unknown>)
			: {};
		for (const key of Object.keys(ofType)) {
			if (!declared.includes(key)) {
				throw refuse(
					`rules.${name}.${key}: "${key}" is not in types.${name}.permits — declare it there first`,
				);
			}
		}
		const permissions: Record<string, unknown[]> = {};
		for (const permit of declared) {
			const here = `rules.${name}.${permit}`;
			const rule = ofType[permit];
			if (typeof rule !== 'function') {
				throw refuse(
					`${here} is missing — a function ({ related, permits }) => [related.…, permits.…]`,
				);
			}
			// A rule that throws stops defineModel with its own error: no catch
			// in the permission engine, as `outage.spec.ts` holds.
			const answered: unknown = rule(
				paramFor(name, permit, related, permits, types),
			);
			if (!Array.isArray(answered) || answered.length === 0) {
				throw refuse(`${here} must answer a non-empty array of references`);
			}
			permissions[permit] = answered.map((element: unknown, index) => {
				if (isRef(element)) return nameOfRef(element);
				if (isRecord(element) && element.kind === 'when') return element;
				throw refuse(
					`${here}[${index}] is ${element === undefined ? 'undefined' : 'not a reference'} — related.x, permits.p, related.x.permits.p, or when(one of those, test)`,
				);
			});
		}
		normalizedTypes[name] = {
			...(def.related === undefined && def.relations === undefined
				? {}
				: { relations: related.get(name) }),
			...(declared.length === 0 ? {} : { permissions }),
		};
	}

	const { rules: _rules, ...rest } = config;
	return { ...rest, types: normalizedTypes } as unknown as ModelConfig;
}

/** The object types the holders of a relation name; `undefined` when one is not an object type. */
function targetsOf(
	holders: unknown,
	types: Record<string, unknown>,
): string[] | undefined {
	const names = isRecord(holders)
		? holders.kind === 'fromField'
			? [holders.subject]
			: []
		: Array.isArray(holders)
			? holders
			: [];
	const targets: string[] = [];
	for (const holder of names) {
		if (typeof holder !== 'string' || !(holder in types)) return undefined;
		targets.push(holder);
	}
	return targets;
}

/** The references one rule is given: its type's relations and permits, the arrows through each relation. */
function paramFor(
	type: string,
	self: string,
	related: Map<string, Record<string, unknown>>,
	permits: Map<string, readonly string[]>,
	types: Record<string, unknown>,
) {
	const arrows = (relation: string, holders: unknown) => {
		const targets = targetsOf(holders, types);
		if (targets === undefined || targets.length === 0) return {};
		const common = (names: (target: string) => readonly string[]) =>
			names(targets[0] as string).filter((name) =>
				targets.every((target) => names(target).includes(name)),
			);
		const through = (permission: string) =>
			Object.freeze({ kind: 'arrow' as const, relation, permission });
		return {
			permits: Object.freeze(
				Object.fromEntries(
					common((target) => permits.get(target) ?? []).map((name) => [
						name,
						through(name),
					]),
				),
			),
			related: Object.freeze(
				Object.fromEntries(
					common((target) => Object.keys(related.get(target) ?? {})).map(
						(name) => [name, through(name)],
					),
				),
			),
		};
	};
	return Object.freeze({
		related: Object.freeze(
			Object.fromEntries(
				Object.entries(related.get(type) ?? {}).map(([name, holders]) => [
					name,
					Object.freeze({
						kind: 'relation' as const,
						type,
						name,
						...arrows(name, holders),
					}),
				]),
			),
		),
		permits: Object.freeze(
			Object.fromEntries(
				(permits.get(type) ?? [])
					.filter((name) => name !== self)
					.map((name) => [
						name,
						Object.freeze({ kind: 'permission' as const, type, name }),
					]),
			),
		),
	});
}
