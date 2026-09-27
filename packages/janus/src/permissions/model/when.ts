/** `when`: a rule under a condition, typed by the `ctx` it tests. */

/**
 * A rule that grants only when `test(ctx)` is true: `when('doctors', (ctx:
 * { onShift: boolean }) => ctx.onShift)`.
 *
 * `rule` is any rule of the same object type — a relation, a permission, an
 * arrow. The test is synchronous and pure: it decides on what the caller
 * passes, and reads nothing, so it can never fail the way a store can.
 */
export interface When<Rule extends string = string, Ctx = never> {
	readonly kind: 'when';
	readonly rule: Rule;
	readonly test: (ctx: Ctx) => boolean;
}

export function when<const Rule extends string, Ctx>(
	rule: Rule,
	test: (ctx: Ctx) => boolean,
): When<Rule, Ctx> {
	return Object.freeze({ kind: 'when', rule, test });
}
