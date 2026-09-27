/**
 * Resolves a model: parses every string once, checks every reference, and
 * refuses with a `TypeError` naming where it is.
 *
 * The types refuse most of these first. This is what refuses them for a model
 * built at run time or written in JavaScript, and what refuses what the types
 * cannot see: names, and a permission that reaches itself without crossing a
 * relation.
 */

import type { ModelConfig } from '../model/config';
import {
	collectNames,
	type DeclaredNames,
	objectTypeNamesOf,
	subjectTypesOf,
} from './declared-names';
import { refuseDataBeyondRoot } from './refuse-data-beyond-root';
import { refuseLoops } from './refuse-loops';
import { resolveRelation } from './resolve-relation';
import { resolveRule } from './resolve-rule';
import type {
	ResolvedModel,
	ResolvedObjectType,
	ResolvedRelation,
	ResolvedRule,
} from './resolved';
import { isRecord, type Refuse } from './step';

export function resolveModel(
	config: ModelConfig,
	where: string,
): ResolvedModel {
	const refuse: Refuse = (message) => new TypeError(`${where}: ${message}`);

	if (!isRecord(config)) throw refuse('pass { subjects, types }');
	const subjects = subjectTypesOf(config.subjects, refuse);
	const typeNames = objectTypeNamesOf(config.types, refuse);
	const declared = collectNames(config.types, refuse);
	const types = resolveTypes(config.types, {
		refuse,
		subjects,
		typeNames,
		declared,
	});

	refuseLoops(types, refuse);
	refuseDataBeyondRoot(types, refuse);

	return { subjects, types };
}

/** Each object type's relations and permissions, every rule parsed once. */
function resolveTypes(
	defs: ModelConfig['types'],
	context: {
		readonly refuse: Refuse;
		readonly subjects: ReadonlySet<string>;
		readonly typeNames: ReadonlySet<string>;
		readonly declared: DeclaredNames;
	},
): Map<string, ResolvedObjectType> {
	const { refuse, subjects, typeNames } = context;
	const { relationNames, permissionNames } = context.declared;
	const isSubjectType = (type: string) =>
		subjects.has(type) || typeNames.has(type);
	const namesOf = (type: string) =>
		new Set([
			...(relationNames.get(type) ?? []),
			...(permissionNames.get(type) ?? []),
		]);

	const types = new Map<string, ResolvedObjectType>();
	for (const [name, def] of Object.entries(defs)) {
		const at = `types.${name}`;
		const relations = new Map<string, ResolvedRelation>();

		for (const [relation, holders] of Object.entries(def.related ?? {})) {
			const here = `${at}.related.${relation}`;
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
		for (const [permission, rules] of Object.entries(def.permits ?? {})) {
			const here = `${at}.permits.${permission}`;
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
	return types;
}
