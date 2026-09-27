/**
 * The names a model declares — subject types, object types, and each object
 * type's relations and permissions — checked before any rule is read.
 */

import type { ModelConfig } from '../model/config';
import { isRecord, type Refuse } from './step';

/** camelCase, as every name in this package — and never `#`, `-`, `>` or `:`, which the notation uses. */
const NAME = /^[a-z][A-Za-z0-9]*$/;

/** The keys the model had before 0.2, and their names since. */
const RENAMED: Readonly<Record<string, string>> = {
	relations: 'related',
	permissions: 'permits',
};

/** The names each object type declares, collected before any rule is read. */
export interface DeclaredNames {
	readonly relationNames: ReadonlyMap<string, ReadonlySet<string>>;
	readonly permissionNames: ReadonlyMap<string, ReadonlySet<string>>;
}

/** The subject types: camelCase names, as `auth.types` gives them. */
export function subjectTypesOf(
	value: ModelConfig['subjects'],
	refuse: Refuse,
): Set<string> {
	// Checked all the same: JavaScript callers pass anything.
	if (!Array.isArray(value)) {
		throw refuse(
			'subjects must be an array of subject type names — auth.types from janus(), or your own',
		);
	}
	for (const subject of value as readonly unknown[]) {
		if (typeof subject !== 'string' || !NAME.test(subject)) {
			throw refuse(
				`the subject type "${String(subject)}" must be a camelCase name`,
			);
		}
	}
	return new Set<string>(value);
}

/**
 * The object types' names: camelCase, and at least one. A user type may be
 * one too — its users are then objects the model grants relations on.
 */
export function objectTypeNamesOf(
	value: ModelConfig['types'],
	refuse: Refuse,
): Set<string> {
	if (!isRecord(value) || Object.keys(value).length === 0) {
		throw refuse('types declares no object type');
	}
	const typeNames = new Set(Object.keys(value));
	for (const name of typeNames) {
		if (!NAME.test(name)) {
			throw refuse(
				`the object type "${name}" must be a camelCase name — letters and digits, starting with a lowercase letter`,
			);
		}
	}
	return typeNames;
}

/**
 * Every type's relation and permission names, first: a subject set or an
 * arrow may name a relation of a type declared further down.
 */
export function collectNames(
	types: ModelConfig['types'],
	refuse: Refuse,
): DeclaredNames {
	const relationNames = new Map<string, Set<string>>();
	const permissionNames = new Map<string, Set<string>>();
	for (const [name, def] of Object.entries(types)) {
		const at = `types.${name}`;
		if (!isRecord(def)) throw refuse(`${at} must be an object`);
		for (const key of Object.keys(def)) {
			if (key === 'related' || key === 'permits') continue;
			throw refuse(
				Object.hasOwn(RENAMED, key)
					? `${at}.${key} is now ${RENAMED[key]}: rename the key`
					: `${at}.${key} is not a key of an object type: related or permits`,
			);
		}
		const relations = namesIn(def.related, `${at}.related`, refuse);
		const permissions = namesIn(def.permits, `${at}.permits`, refuse);
		for (const permission of permissions) {
			if (relations.has(permission)) {
				throw refuse(
					`${at}: "${permission}" names a relation and a permission; rename one`,
				);
			}
		}
		relationNames.set(name, relations);
		permissionNames.set(name, permissions);
	}
	return { relationNames, permissionNames };
}

function namesIn(value: unknown, at: string, refuse: Refuse): Set<string> {
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
