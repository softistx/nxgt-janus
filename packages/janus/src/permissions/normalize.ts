/**
 * The reference form, at run time: `defineModel` calls each rule function
 * once, with frozen references, and spells what it answers into the string
 * form `resolveModel` reads. The types of the form are in `./rules`; this
 * file is to them what `./resolve` is to `./model`.
 */

import type { ModelConfig } from './model';
import { paramFor } from './references';
import type { Ref } from './rules';

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

/** What `normalizeRules` answers: the string form, and which types it spelled out. */
export interface NormalizedConfig {
	readonly config: ModelConfig;
	/** The types written with `related` and `permits`: `resolveModel` names their keys. */
	readonly referenceForm: ReadonlySet<string>;
}

type Refuse = (message: string) => TypeError;

/**
 * The string form of a configuration written with `related`, `permits` and
 * `rules`: each rule function called once, with references, and what it
 * answers spelled out. A type written with strings passes through as it is.
 * Every refusal is a `TypeError` naming where it is, as `resolveModel`'s.
 *
 * A type is written in one form or the other — `related` and `permits`, or
 * `relations` and `permissions` — never one key of each.
 */
export function normalizeRules(
	model: ModelConfig,
	where: string,
): NormalizedConfig {
	const config = raw(model);
	const refuse: Refuse = (message) => new TypeError(`${where}: ${message}`);
	const types = config.types;
	if (!isRecord(types)) throw refuse('types declares no object type');
	const rules = config.rules;
	if (rules !== undefined && !isRecord(rules)) {
		throw refuse(
			'rules must be an object: one entry per type that declares permits',
		);
	}

	const names = declaredNames(types, refuse);
	refuseStrayRules(rules ?? {}, types, names.referenceForm, refuse);

	const normalizedTypes: Record<string, unknown> = {};
	for (const [name, def] of Object.entries(types)) {
		normalizedTypes[name] = names.referenceForm.has(name)
			? spellOut(name, rules?.[name], names, types, refuse)
			: def;
	}

	const { rules: _rules, ...rest } = config;
	return {
		config: { ...rest, types: normalizedTypes } as unknown as ModelConfig,
		referenceForm: names.referenceForm,
	};
}

/** The names every type declares, in either form: what a rule's references are built from. */
export interface Names {
	readonly related: ReadonlyMap<string, Record<string, unknown>>;
	readonly permits: ReadonlyMap<string, readonly string[]>;
	readonly referenceForm: ReadonlySet<string>;
}

const REFERENCE_KEYS: readonly string[] = ['related', 'permits'];

/**
 * The names of every type, read before any rule runs: an arrow reaches names
 * of a type declared further down. Refuses a type that mixes the two forms,
 * and a `permits` that is not a list of distinct names.
 */
function declaredNames(types: Record<string, unknown>, refuse: Refuse): Names {
	const related = new Map<string, Record<string, unknown>>();
	const permits = new Map<string, readonly string[]>();
	const referenceForm = new Set<string>();
	for (const [name, def] of Object.entries(types)) {
		const at = `types.${name}`;
		if (!isRecord(def)) throw refuse(`${at} must be an object`);
		if (def.relations !== undefined && def.related !== undefined) {
			throw refuse(`${at} has both relations and related. Pass one.`);
		}
		if (def.permissions !== undefined && def.permits !== undefined) {
			throw refuse(`${at} has both permissions and permits. Pass one.`);
		}
		const isReference = def.related !== undefined || def.permits !== undefined;
		if (isReference) {
			if (def.relations !== undefined || def.permissions !== undefined) {
				throw refuse(
					`${at} mixes the two forms: related and permits, or relations and permissions — not one of each`,
				);
			}
			for (const key of Object.keys(def)) {
				if (!REFERENCE_KEYS.includes(key)) {
					throw refuse(
						`${at}.${key} is not a key of an object type: related or permits`,
					);
				}
			}
			referenceForm.add(name);
		}
		const relationsKey = isReference ? 'related' : 'relations';
		const relations = def[relationsKey];
		if (relations !== undefined && !isRecord(relations)) {
			throw refuse(`${at}.${relationsKey} must be an object`);
		}
		related.set(name, relations ?? {});
		permits.set(
			name,
			isReference
				? permitsIn(def.permits, `${at}.permits`, refuse)
				: isRecord(def.permissions)
					? Object.keys(def.permissions)
					: [],
		);
	}
	return { related, permits, referenceForm };
}

/** A `permits` list: absent is none; anything else must be distinct strings. */
function permitsIn(value: unknown, at: string, refuse: Refuse): string[] {
	if (value === undefined) return [];
	if (
		!Array.isArray(value) ||
		!value.every((permit) => typeof permit === 'string')
	) {
		throw refuse(`${at} must be an array of permission names`);
	}
	const seen = new Set<string>();
	for (const permit of value as string[]) {
		if (seen.has(permit)) throw refuse(`${at} names "${permit}" twice`);
		seen.add(permit);
	}
	return value as string[];
}

/** Rules for a type that does not exist, or for one written with strings. */
function refuseStrayRules(
	rules: Record<string, unknown>,
	types: Record<string, unknown>,
	referenceForm: ReadonlySet<string>,
	refuse: Refuse,
): void {
	for (const name of Object.keys(rules)) {
		if (referenceForm.has(name)) continue;
		throw refuse(
			`rules.${name}: ${
				Object.hasOwn(types, name)
					? `types.${name} writes its permissions as strings; rules is for a type that declares permits`
					: `no object type named "${name}"`
			}`,
		);
	}
}

/**
 * One type of the reference form, in the string form: each rule called once
 * with its references, what it answers spelled out as names.
 */
function spellOut(
	name: string,
	written: unknown,
	names: Names,
	types: Record<string, unknown>,
	refuse: Refuse,
): Record<string, unknown> {
	const declared = names.permits.get(name) ?? [];
	const ofType = isRecord(written) ? written : {};
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
				`${here} ${rule === undefined ? 'is missing' : 'must be a function'} — ({ related, permits }) => [related.…, permits.…]`,
			);
		}
		// A rule that throws stops defineModel with its own error: no catch
		// in the permission engine, as `outage.spec.ts` holds.
		const answered: unknown = rule(paramFor(name, permit, names, types));
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
	const def = types[name] as Record<string, unknown>;
	return {
		...(def.related === undefined
			? {}
			: { relations: names.related.get(name) }),
		// `permits: []` is `permissions: {}`, as `Normalized` types it.
		...(def.permits === undefined ? {} : { permissions }),
	};
}
