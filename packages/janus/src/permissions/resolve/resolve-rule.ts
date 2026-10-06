/** One rule of a permission: a name, an arrow, or either under `when()`. */

import type { ResolvedRelation, ResolvedRule } from './resolved';
import { isRecord, type Refuse } from './step';

export function resolveRule(
	value: unknown,
	here: string,
	context: {
		refuse: Refuse;
		own: ReadonlySet<string>;
		relations: ReadonlyMap<string, ResolvedRelation>;
		typeNames: ReadonlySet<string>;
		namesOf: (type: string) => ReadonlySet<string>;
		self: string;
	},
): ResolvedRule {
	const { refuse } = context;

	if (isRecord(value) && value['kind'] === 'when') {
		if (typeof value['test'] !== 'function') {
			throw refuse(`${here}: when() takes a function as its test`);
		}
		const inner = resolveRule(value['rule'], here, context);
		return { ...inner, test: value['test'] as (ctx: never) => boolean };
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
