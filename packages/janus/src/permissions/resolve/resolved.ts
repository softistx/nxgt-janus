/**
 * A model, resolved: what `can()`, `list()` and `grant()` read — every string
 * already parsed, every reference already checked.
 */

import type { Subject } from '../../subjects/subject';

/** Who may hold a stored relation: a subject type, or a subject set. */
export type Holder =
	| { readonly kind: 'type'; readonly type: string }
	| { readonly kind: 'set'; readonly type: string; readonly relation: string };

/**
 * Whether a stored relation admits `subject` as a holder: an entity of a
 * declared type, or a set of a declared `type#relation`. One rule for what
 * `grant()` writes and what `can()` and `list()` follow — a tuple the model
 * does not admit grants nothing, however it was stored.
 */
export function admits(holders: readonly Holder[], subject: Subject): boolean {
	return holders.some((holder) =>
		holder.kind === 'type'
			? !('relation' in subject) && holder.type === subject.type
			: 'relation' in subject &&
				holder.type === subject.type &&
				holder.relation === subject.relation,
	);
}

export type ResolvedRelation =
	| { readonly kind: 'stored'; readonly holders: readonly Holder[] }
	| {
			readonly kind: 'fromField';
			readonly field: string;
			readonly subject: string;
			/** What `list()` reverses it with. Absent: `list()` cannot reach through it. */
			readonly lookup?: (subjectId: string) => Promise<readonly string[]>;
	  };

/** One rule of a permission. `test`, when present, must pass for it to grant. */
export type ResolvedRule = (
	| { readonly kind: 'name'; readonly name: string }
	| {
			readonly kind: 'arrow';
			readonly relation: string;
			readonly target: string;
	  }
) & { readonly test?: (ctx: never) => boolean };

export interface ResolvedObjectType {
	readonly name: string;
	readonly relations: ReadonlyMap<string, ResolvedRelation>;
	readonly permissions: ReadonlyMap<string, readonly ResolvedRule[]>;
}

export interface ResolvedModel {
	readonly subjects: ReadonlySet<string>;
	readonly types: ReadonlyMap<string, ResolvedObjectType>;
}
