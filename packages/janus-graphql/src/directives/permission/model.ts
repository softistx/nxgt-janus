/**
 * What `@permission` reads of the permission model when the schema is built:
 * the object types, the names each declares, whether one reads a field of
 * its object (`fromField`), and whether a permission reaches a condition
 * (`when`). Read from `access.model`, as `defineModel()` answered it.
 */

/** `access.model`, as this module reads it. */
export interface ModelLike {
	readonly types: readonly string[];
	readonly definition: {
		readonly types: {
			readonly [type: string]: {
				readonly related?: { readonly [name: string]: unknown };
				readonly permits?: { readonly [name: string]: readonly unknown[] };
			};
		};
	};
}

/** `access.model`, or `null` when `access` is not what `permissions()` answered. */
export function modelOf(access: unknown): ModelLike | null {
	const model = (access as { readonly model?: Partial<ModelLike> } | undefined)
		?.model;
	if (!Array.isArray(model?.types) || model.definition?.types === undefined) {
		return null;
	}
	return model as ModelLike;
}

/** The relations and permissions `type` declares: what `can()` may be asked. */
export function namesOf(model: ModelLike, type: string): readonly string[] {
	const def = model.definition.types[type];
	return [
		...Object.keys(def?.related ?? {}),
		...Object.keys(def?.permits ?? {}),
	];
}

type FromFieldLike = {
	readonly kind: 'fromField';
	readonly field: string;
	readonly subject: string;
};

function isFromField(value: unknown): value is FromFieldLike {
	return (value as { readonly kind?: unknown } | null)?.kind === 'fromField';
}

/** The fields `type`'s `fromField`s read; empty when it has none. */
export function fieldsOf(model: ModelLike, type: string): readonly string[] {
	const related = model.definition.types[type]?.related ?? {};
	return Object.values(related)
		.filter(isFromField)
		.map((def) => def.field);
}

/**
 * Whether `can(…, name, { type })` reaches a `when` — through the
 * permission's rules, the permissions they name, and arrows into other types
 * — and so needs a `ctx`. What `CtxOf` computes in the compiler.
 */
export function reachesCondition(
	model: ModelLike,
	type: string,
	name: string,
	seen: Set<string> = new Set(),
): boolean {
	const key = `${type}.${name}`;
	if (seen.has(key)) return false;
	seen.add(key);
	const def = model.definition.types[type];
	for (const rule of def?.permits?.[name] ?? []) {
		if (typeof rule !== 'string') return true; // a when()
		const [relation, target] = rule.split('->');
		if (target === undefined) {
			if (reachesCondition(model, type, rule, seen)) return true;
			continue;
		}
		for (const next of arrowTargets(def?.related?.[relation as string])) {
			if (reachesCondition(model, next, target, seen)) return true;
		}
	}
	return false;
}

/** The object types an arrow through a relation of this definition reaches. */
function arrowTargets(relation: unknown): readonly string[] {
	if (isFromField(relation)) {
		return [relation.subject];
	}
	if (!Array.isArray(relation)) return [];
	return relation
		.filter((holder): holder is string => typeof holder === 'string')
		.map((holder) => holder.split('#')[0] as string);
}
