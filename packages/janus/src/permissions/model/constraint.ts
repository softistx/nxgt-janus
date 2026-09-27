/** The constraint `defineModel` puts on `types`: what it offers and accepts for each object type. */

import type { FromField } from './from-field';
import type {
	PermissionsOf,
	RelationsOf,
	RuleRefOf,
	SubjectRefOf,
} from './names';
import type { Refusal, Spelled } from './refusal';
import type { When } from './when';

/**
 * What `defineModel` offers and accepts for each object type, given the
 * subject types `S` and every object type `Ts`: the constraint of its `types`.
 *
 * **A constraint, so that an editor completes it.** The names a relation, a
 * rule, a `fromField` or a `when` may take are unions of literals here, and an
 * editor reads a type parameter's constraint to offer them — `'patient'`,
 * `'team#members'`, `'teams->view'`. A check intersected into the parameter
 * instead (`C & Checked<C>`) refuses the same mistakes, but meets the literal
 * being typed and completes nothing: measured with the language service.
 *
 * A permission's own name is not among its rules: `view: ['view']` adds
 * nothing and is a loop no relation ends, so it is neither offered nor
 * accepted. A loop through another permission is `defineModel`'s to refuse.
 *
 * A wrong name is unassignable **on that name** — on the whole `fromField(…)`
 * or `when(…)` call for those two — and the error lists the ones it could
 * have been, with "Did you mean" when one is close.
 */
export type ModelTypesOf<S extends string, Ts> = {
	readonly [T in keyof Ts]: {
		readonly related?: {
			readonly [name: string]:
				| readonly Spelled<SubjectRefOf<S, Ts>>[]
				| FromField<string, Spelled<S | (keyof Ts & string)>>;
		};
		readonly permits?: {
			readonly [P in PermissionsOf<Ts, T>]: P extends RelationsOf<Ts, T>
				? Refusal<
						`"${P}" names a relation and a permission of ${T & string}; rename one`,
						never
					>
				: readonly (
						| Spelled<Exclude<RuleRefOf<Ts, T>, P>>
						| When<Spelled<Exclude<RuleRefOf<Ts, T>, P>>, never>
					)[];
		};
	} & {
		// `permission:` beside `relations` would be dropped by the constraint
		// above and refused only when defineModel runs.
		readonly [K in Exclude<keyof Ts[T], 'related' | 'permits'>]: Refusal<
			K extends 'relations'
				? `${T & string}.relations is now related: rename the key`
				: K extends 'permissions'
					? `${T & string}.permissions is now permits: rename the key`
					: `${T & string}.${K & string} is not a key of an object type: related or permits`,
			never
		>;
	};
};
