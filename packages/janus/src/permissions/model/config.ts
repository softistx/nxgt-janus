/** The shape of a model, as written: its subject types and its object types. */

import type { FromField } from './from-field';
import type { When } from './when';

/**
 * Who may hold a relation: subject types — `'staff'`, a user type, or `'team'`,
 * an object type — and subject sets, `'team#members'`: every member of a team.
 * Or a relation read from the object's data.
 */
export type RelationDef = readonly string[] | FromField;

/**
 * One way to hold a permission: a relation or a permission of the same object
 * type (`'doctors'`, `'manage'`), an arrow to a permission of a related object
 * (`'teams->view'`: who can view the record's teams), or one of those under a
 * condition.
 */
export type RuleDef = string | When<string, never>;

export interface ObjectTypeDef {
	readonly related?: { readonly [name: string]: RelationDef };
	/** Each permission is the union of its rules. */
	readonly permits?: { readonly [name: string]: readonly RuleDef[] };
}

export interface ModelConfig {
	/**
	 * The user types that can be subjects — pass `auth.types` from `janus()`,
	 * so a user type and a subject type are one name.
	 */
	readonly subjects: readonly string[];
	readonly types: { readonly [name: string]: ObjectTypeDef };
}
