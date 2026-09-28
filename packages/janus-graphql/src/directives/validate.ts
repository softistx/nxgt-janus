/**
 * Decides, when the schema is built, what the directives on one field add up
 * to — and refuses with a `TypeError` what no request could ever pass: a user
 * type `auth` does not know, a `type: []`, restrictions that exclude each
 * other, or a `@permission` the model, the field or the wiring cannot answer
 * (`permission/validate.ts`).
 */

import {
	type FieldShape,
	type PermissionCheck,
	type PermissionWiring,
	permissionCheckOf,
} from './permission/validate';
import type { AuthenticatedUse, FieldDirectives } from './read';
import { list, on, PREFIX } from './words';

/** What a field requires before its resolver runs. */
export interface Requirement {
	/** `Type.field`, for the messages. */
	readonly where: string;
	/** The directive a missing `ctx.janus` is reported against. */
	readonly label: string;
	/**
	 * The user types allowed, every `type:` intersected; `null` when none
	 * narrows it: any signed-in user.
	 */
	readonly types: ReadonlySet<string> | null;
	/** The permissions asked after that, in order: every one must hold. */
	readonly permissions: readonly PermissionCheck[];
}

/** The user types a schema may name: `auth.types`, or the one `useJanus({ type })` keeps. */
export interface Known {
	readonly types: readonly string[];
}

/**
 * The requirement of one field, or `null` when nothing guards it. Throws a
 * `TypeError` naming the field for a directive no request could pass.
 */
export function requirementOf(
	field: FieldShape,
	directives: FieldDirectives,
	known: Known,
	wiring: PermissionWiring,
): Requirement | null {
	const { authenticated, permission } = directives;
	if (authenticated.length === 0 && permission.length === 0) return null;
	const [first] = authenticated;
	return {
		where: field.name,
		label:
			first === undefined
				? `@permission on ${on((permission[0] as { where: string }).where, field.name)}`
				: `@authenticated on ${on(first.where, field.name)}`,
		types: typesOf(field.name, authenticated, known),
		permissions: permission.map((use) => permissionCheckOf(use, field, wiring)),
	};
}

/** Every `type:` intersected, or `null` when none names any. */
function typesOf(
	field: string,
	uses: readonly AuthenticatedUse[],
	known: Known,
): ReadonlySet<string> | null {
	let types: Set<string> | null = null;
	for (const { where, types: named } of uses) {
		if (named === null) continue;
		if (named.length === 0) {
			throw new TypeError(
				`${PREFIX}: @authenticated on ${on(where, field)} names no user type — leave type: out to admit any signed-in user`,
			);
		}
		for (const name of named) {
			if (!known.types.includes(name)) {
				throw new TypeError(
					`${PREFIX}: @authenticated on ${on(where, field)} names the user type '${name}', which is not one of ${list(known.types)}`,
				);
			}
		}
		types =
			types === null
				? new Set(named)
				: new Set(named.filter((name) => types?.has(name)));
	}
	if (types !== null && types.size === 0) {
		throw new TypeError(
			`${PREFIX}: the @authenticated on ${field} and on its type or interfaces admit no user type in common`,
		);
	}
	return types;
}
