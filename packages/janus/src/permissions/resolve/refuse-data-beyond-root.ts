import type { Refuse } from './refuse';
import type { ResolvedObjectType } from './resolved';

/**
 * A `fromField` is read from the object `can()` was given — the route loaded
 * it (decided 2026-09-24). An object reached through a subject set or an arrow
 * was loaded by nobody, so a rule that needs its data could never be decided.
 * Refused here, where it is a sentence, rather than at the first check that
 * reaches it, where it would be a denial nobody can explain.
 */
export function refuseDataBeyondRoot(
	types: ReadonlyMap<string, ResolvedObjectType>,
	refuse: Refuse,
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
						`types.${type.name}.related.${relation}: "${holder.type}#${holder.relation}" reads ${holder.type}.${field}, and a subject set reaches ${holder.type}s nobody passed to can() — store that relation instead of reading it`,
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
							`types.${type.name}.permits.${permission}: "${rule.relation}->${rule.target}" reaches ${name}.${rule.target}, which reads ${name}.${field}, and only the object passed to can() carries its data — store that relation instead of reading it`,
						);
					}
				}
			}
		}
	}
}
