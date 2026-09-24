/**
 * A model, resolved: every string parsed once, every reference checked, every
 * refusal a `TypeError` naming where it is.
 *
 * The types refuse most of these first. This is what refuses them for a model
 * built at run time or written in JavaScript, and what refuses what the types
 * cannot see: names, and a permission that reaches itself without crossing a
 * relation.
 */

import type { Subject } from '../subjects/subject';
import type { ModelConfig } from './model';

/** Who may hold a stored relation: a subject type, or a subject set. */
export type Holder =
	| { readonly kind: 'type'; readonly type: string }
	| { readonly kind: 'set'; readonly type: string; readonly relation: string };

/**
 * Whether a stored relation admits `subject` as a holder: an entity of a
 * declared type, or a set of a declared `type#relation`. One rule for what
 * `grant()` writes and what `can()` and `list()` follow — a tuple the model
 * does not admit grants nothing, however it was stored.
 */
export function admits(holders: readonly Holder[], subject: Subject): boolean {
	return holders.some((holder) =>
		holder.kind === 'type'
			? !('relation' in subject) && holder.type === subject.type
			: 'relation' in subject &&
				holder.type === subject.type &&
				holder.relation === subject.relation,
	);
}

export type ResolvedRelation =
	| { readonly kind: 'stored'; readonly holders: readonly Holder[] }
	| {
			readonly kind: 'fromField';
			readonly field: string;
			readonly subject: string;
			/** What `list()` reverses it with. Absent: `list()` cannot reach through it. */
			readonly lookup?: (subjectId: string) => Promise<readonly string[]>;
	  };

/** One rule of a permission. `test`, when present, must pass for it to grant. */
export type ResolvedRule = (
	| { readonly kind: 'name'; readonly name: string }
	| {
			readonly kind: 'arrow';
			readonly relation: string;
			readonly target: string;
	  }
) & { readonly test?: (ctx: never) => boolean };

export interface ResolvedObjectType {
	readonly name: string;
	readonly relations: ReadonlyMap<string, ResolvedRelation>;
	readonly permissions: ReadonlyMap<string, readonly ResolvedRule[]>;
}

export interface ResolvedModel {
	readonly subjects: ReadonlySet<string>;
	readonly types: ReadonlyMap<string, ResolvedObjectType>;
}

/** camelCase, as every name in this package — and never `#`, `-`, `>` or `:`, which the notation uses. */
const NAME = /^[a-z][A-Za-z0-9]*$/;
/** A field `fromField` reads: a top-level property. */
const FIELD = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

export function resolveModel(
	config: ModelConfig,
	where: string,
): ResolvedModel {
	const refuse = (message: string) => new TypeError(`${where}: ${message}`);

	if (!isRecord(config)) throw refuse('pass { subjects, types }');
	if (!Array.isArray(config.subjects)) {
		throw refuse(
			'subjects must be an array of subject type names — auth.types from janus(), or your own',
		);
	}
	for (const subject of config.subjects) {
		if (typeof subject !== 'string' || !NAME.test(subject)) {
			throw refuse(
				`the subject type "${String(subject)}" must be a camelCase name`,
			);
		}
	}
	const subjects = new Set<string>(config.subjects);

	if (!isRecord(config.types) || Object.keys(config.types).length === 0) {
		throw refuse('types declares no object type');
	}
	const typeNames = new Set(Object.keys(config.types));
	for (const name of typeNames) {
		if (!NAME.test(name)) {
			throw refuse(
				`the object type "${name}" must be a camelCase name — letters and digits, starting with a lowercase letter`,
			);
		}
		if (subjects.has(name)) {
			throw refuse(
				`"${name}" names a user type and an object type; a subject of type "${name}" would be ambiguous`,
			);
		}
	}

	// The relation names first: a subject set or an arrow may name a relation
	// of a type declared further down.
	const relationNames = new Map<string, Set<string>>();
	const permissionNames = new Map<string, Set<string>>();
	for (const [name, def] of Object.entries(config.types)) {
		const at = `types.${name}`;
		if (!isRecord(def)) throw refuse(`${at} must be an object`);
		for (const key of Object.keys(def)) {
			if (key !== 'relations' && key !== 'permissions') {
				throw refuse(`${at}.${key} is not a key of an object type`);
			}
		}
		relationNames.set(name, namesIn(def.relations, `${at}.relations`, refuse));
		const permissions = namesIn(def.permissions, `${at}.permissions`, refuse);
		for (const permission of permissions) {
			if (relationNames.get(name)?.has(permission)) {
				throw refuse(
					`${at}: "${permission}" names a relation and a permission; rename one`,
				);
			}
		}
		permissionNames.set(name, permissions);
	}

	const isSubjectType = (type: string) =>
		subjects.has(type) || typeNames.has(type);
	const namesOf = (type: string) =>
		new Set([
			...(relationNames.get(type) ?? []),
			...(permissionNames.get(type) ?? []),
		]);

	const types = new Map<string, ResolvedObjectType>();
	for (const [name, def] of Object.entries(config.types)) {
		const at = `types.${name}`;
		const relations = new Map<string, ResolvedRelation>();

		for (const [relation, holders] of Object.entries(def.relations ?? {})) {
			const here = `${at}.relations.${relation}`;
			relations.set(
				relation,
				resolveRelation(holders, here, {
					refuse,
					isSubjectType,
					relationNames,
				}),
			);
		}

		const permissions = new Map<string, readonly ResolvedRule[]>();
		for (const [permission, rules] of Object.entries(def.permissions ?? {})) {
			const here = `${at}.permissions.${permission}`;
			if (!Array.isArray(rules) || rules.length === 0) {
				throw refuse(`${here} must be a non-empty array of rules`);
			}
			permissions.set(
				permission,
				rules.map((rule: unknown, index: number) =>
					resolveRule(rule, `${here}[${index}]`, {
						refuse,
						own: namesOf(name),
						relations,
						typeNames,
						namesOf,
						self: name,
					}),
				),
			);
		}

		types.set(name, { name, relations, permissions });
	}

	refuseLoops(types, refuse);
	refuseDataBeyondRoot(types, refuse);

	return { subjects, types };
}

function namesIn(
	value: unknown,
	at: string,
	refuse: (message: string) => TypeError,
): Set<string> {
	if (value === undefined) return new Set();
	if (!isRecord(value)) throw refuse(`${at} must be an object`);
	for (const name of Object.keys(value)) {
		if (!NAME.test(name)) {
			throw refuse(
				`${at}: "${name}" must be a camelCase name — letters and digits, starting with a lowercase letter`,
			);
		}
	}
	return new Set(Object.keys(value));
}

function resolveRelation(
	value: unknown,
	here: string,
	{
		refuse,
		isSubjectType,
		relationNames,
	}: {
		refuse: (message: string) => TypeError;
		isSubjectType: (type: string) => boolean;
		relationNames: ReadonlyMap<string, ReadonlySet<string>>;
	},
): ResolvedRelation {
	if (isRecord(value) && value.kind === 'fromField') {
		const { field, subject, lookup } = value;
		if (typeof field !== 'string' || !FIELD.test(field)) {
			throw refuse(`${here}: fromField must name a top-level field`);
		}
		if (typeof subject !== 'string' || !isSubjectType(subject)) {
			throw refuse(
				`${here}: fromField names "${String(subject)}", which is not a subject type`,
			);
		}
		if (lookup !== undefined && typeof lookup !== 'function') {
			throw refuse(`${here}: fromField's lookup must be a function`);
		}
		return lookup === undefined
			? { kind: 'fromField', field, subject }
			: {
					kind: 'fromField',
					field,
					subject,
					lookup: lookup as (subjectId: string) => Promise<readonly string[]>,
				};
	}

	if (!Array.isArray(value) || value.length === 0) {
		throw refuse(
			`${here} must be a non-empty array of subject types, or fromField()`,
		);
	}
	const holders = value.map((holder: unknown): Holder => {
		if (typeof holder !== 'string') {
			throw refuse(`${here}: a holder must be a string`);
		}
		const hash = holder.indexOf('#');
		if (hash < 0) {
			if (!isSubjectType(holder)) {
				throw refuse(`${here}: "${holder}" is not a subject type`);
			}
			return { kind: 'type', type: holder };
		}
		const type = holder.slice(0, hash);
		const relation = holder.slice(hash + 1);
		if (!relationNames.get(type)?.has(relation)) {
			throw refuse(
				`${here}: "${holder}" is not a subject set — it must name an object type and one of its relations`,
			);
		}
		return { kind: 'set', type, relation };
	});
	return { kind: 'stored', holders };
}

function resolveRule(
	value: unknown,
	here: string,
	context: {
		refuse: (message: string) => TypeError;
		own: ReadonlySet<string>;
		relations: ReadonlyMap<string, ResolvedRelation>;
		typeNames: ReadonlySet<string>;
		namesOf: (type: string) => ReadonlySet<string>;
		self: string;
	},
): ResolvedRule {
	const { refuse } = context;

	if (isRecord(value) && value.kind === 'when') {
		if (typeof value.test !== 'function') {
			throw refuse(`${here}: when() takes a function as its test`);
		}
		const inner = resolveRule(value.rule, here, context);
		return { ...inner, test: value.test as (ctx: never) => boolean };
	}
	if (typeof value !== 'string') {
		throw refuse(`${here}: a rule is a name, an arrow, or when()`);
	}

	const arrow = value.indexOf('->');
	if (arrow < 0) {
		if (!context.own.has(value)) {
			throw refuse(
				`${here}: "${value}" is not a relation or a permission of ${context.self}`,
			);
		}
		return { kind: 'name', name: value };
	}

	const relation = value.slice(0, arrow);
	const target = value.slice(arrow + 2);
	const through = context.relations.get(relation);
	if (through === undefined) {
		throw refuse(
			`${here}: "${value}" goes through "${relation}", which is not a relation of ${context.self}`,
		);
	}
	const targets =
		through.kind === 'fromField'
			? [through.subject]
			: through.holders.map((holder) =>
					holder.kind === 'type' ? holder.type : null,
				);
	for (const type of targets) {
		// A subject set, or a user type, has no permissions to follow.
		if (type === null || !context.typeNames.has(type)) {
			throw refuse(
				`${here}: "${value}" goes through "${relation}", which can hold ${type === null ? 'a subject set' : `a ${type}`}; an arrow follows object types only`,
			);
		}
		if (!context.namesOf(type).has(target)) {
			throw refuse(
				`${here}: "${value}" names "${target}", which ${type} does not declare`,
			);
		}
	}
	return { kind: 'arrow', relation, target };
}

/**
 * A permission that reaches itself through names alone — `view: ['edit']`,
 * `edit: ['view']` — never reaches a relation, so no data could end the walk.
 * Refused here rather than cut at run time: it is a model's bug, not a
 * user's data.
 */
function refuseLoops(
	types: ReadonlyMap<string, ResolvedObjectType>,
	refuse: (message: string) => TypeError,
): void {
	for (const type of types.values()) {
		const visiting: string[] = [];
		const done = new Set<string>();

		const visit = (permission: string): void => {
			if (done.has(permission)) return;
			const loop = visiting.indexOf(permission);
			if (loop >= 0) {
				throw refuse(
					`types.${type.name}.permissions: ${[...visiting.slice(loop), permission].join(' → ')} is a loop no relation ends`,
				);
			}
			visiting.push(permission);
			for (const rule of type.permissions.get(permission) ?? []) {
				if (rule.kind === 'name' && type.permissions.has(rule.name)) {
					visit(rule.name);
				}
			}
			visiting.pop();
			done.add(permission);
		};

		for (const permission of type.permissions.keys()) visit(permission);
	}
}

/**
 * A `fromField` is read from the object `can()` was given — the route loaded
 * it (decided 2026-09-24). An object reached through a subject set or an arrow
 * was loaded by nobody, so a rule that needs its data could never be decided.
 * Refused here, where it is a sentence, rather than at the first check that
 * reaches it, where it would be a denial nobody can explain.
 */
function refuseDataBeyondRoot(
	types: ReadonlyMap<string, ResolvedObjectType>,
	refuse: (message: string) => TypeError,
): void {
	/** The field `name` of `type` reads, directly or through its own rules; `null` when none. */
	const fieldRead = (type: ResolvedObjectType, name: string): string | null => {
		const relation = type.relations.get(name);
		if (relation !== undefined) {
			return relation.kind === 'fromField' ? relation.field : null;
		}
		for (const rule of type.permissions.get(name) ?? []) {
			const field =
				rule.kind === 'name'
					? fieldRead(type, rule.name)
					: // An arrow reads its own relation on this object.
						fieldRead(type, rule.relation);
			if (field !== null) return field;
		}
		return null;
	};

	for (const type of types.values()) {
		for (const [relation, def] of type.relations) {
			if (def.kind !== 'stored') continue;
			for (const holder of def.holders) {
				if (holder.kind !== 'set') continue;
				const target = types.get(holder.type);
				const field =
					target === undefined ? null : fieldRead(target, holder.relation);
				if (field !== null) {
					throw refuse(
						`types.${type.name}.relations.${relation}: "${holder.type}#${holder.relation}" reads ${holder.type}.${field}, and a subject set reaches ${holder.type}s nobody passed to can() — store that relation instead of reading it`,
					);
				}
			}
		}
		for (const [permission, rules] of type.permissions) {
			for (const rule of rules) {
				if (rule.kind !== 'arrow') continue;
				const through = type.relations.get(rule.relation);
				const targets =
					through?.kind === 'fromField'
						? [through.subject]
						: (through?.holders ?? []).map((holder) => holder.type);
				for (const name of targets) {
					const target = types.get(name);
					const field =
						target === undefined ? null : fieldRead(target, rule.target);
					if (field !== null) {
						throw refuse(
							`types.${type.name}.permissions.${permission}: "${rule.relation}->${rule.target}" reaches ${name}.${rule.target}, which reads ${name}.${field}, and only the object passed to can() carries its data — store that relation instead of reading it`,
						);
					}
				}
			}
		}
	}
}
