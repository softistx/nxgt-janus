import type { Refuse } from './refuse';
import type { ResolvedObjectType } from './resolved';

/**
 * A permission that reaches itself through names alone — `view: ['edit']`,
 * `edit: ['view']` — never reaches a relation, so no data could end the walk.
 * Refused here rather than cut at run time: it is a model's bug, not a
 * user's data.
 */
export function refuseLoops(
	types: ReadonlyMap<string, ResolvedObjectType>,
	refuse: Refuse,
): void {
	for (const type of types.values()) {
		const visiting: string[] = [];
		const done = new Set<string>();

		const visit = (permission: string): void => {
			if (done.has(permission)) return;
			const loop = visiting.indexOf(permission);
			if (loop >= 0) {
				throw refuse(
					`types.${type.name}.permits: ${[...visiting.slice(loop), permission].join(' → ')} is a loop no relation ends`,
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
