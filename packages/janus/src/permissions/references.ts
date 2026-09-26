/**
 * The references a rule function is given: its type's relations and permits,
 * frozen, and through each relation the arrows every holder type admits —
 * the run-time side of `RuleParam` in `./rules`, intersected kind by kind as
 * it is.
 */

import type { Names } from './normalize';

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

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
		if (typeof holder !== 'string' || !Object.hasOwn(types, holder)) {
			return undefined;
		}
		targets.push(holder);
	}
	return targets;
}

/** The references one rule is given: its type's relations and permits, the arrows through each relation. */
export function paramFor(
	type: string,
	self: string,
	{ related, permits }: Names,
	types: Record<string, unknown>,
) {
	const arrows = (relation: string, holders: unknown) => {
		const targets = targetsOf(holders, types);
		// Empty, not absent: from JavaScript, `related.owners.permits.view`
		// through a relation held by users is then `undefined`, which the rule's
		// answer names — not a native error from inside the rule.
		if (targets === undefined || targets.length === 0) {
			return { permits: Object.freeze({}), related: Object.freeze({}) };
		}
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
