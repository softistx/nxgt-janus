/**
 * Decides, when the schema is built, what the directives on one field add up
 * to — and refuses with a `TypeError` what no request could ever pass: a user
 * type `auth` does not know, a `type: []`, restrictions that exclude each
 * other, or a `@permission`, which is declared and not enforced yet.
 */

import type { FieldDirectives } from './read';

/** What a field requires before its resolver runs. */
export interface Requirement {
	/** `Type.field`, for the messages. */
	readonly where: string;
	/**
	 * The user types allowed, every `type:` intersected; `null` when none
	 * narrows it: any signed-in user.
	 */
	readonly types: ReadonlySet<string> | null;
}

/** The user types a schema may name: `auth.types`, or the one `useJanus({ type })` keeps. */
export interface Known {
	readonly types: readonly string[];
}

const PREFIX = 'applyJanusDirectives()';

/**
 * The requirement of one field, or `null` when nothing guards it. Throws a
 * `TypeError` naming the field for a directive no request could pass.
 */
export function requirementOf(
	field: string,
	directives: FieldDirectives,
	known: Known,
): Requirement | null {
	const [permission] = directives.permission;
	if (permission !== undefined) {
		throw new TypeError(
			`${PREFIX}: @permission on ${on(permission, field)} is not enforced yet — check it in the resolver with can(ctx, …) until it is`,
		);
	}
	if (directives.authenticated.length === 0) return null;

	let types: Set<string> | null = null;
	for (const { where, types: named } of directives.authenticated) {
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
	return { where: field, types };
}

/** `Query.me`, or `Record (read by Record.title)` for a type's directive. */
function on(where: string, field: string): string {
	return where === field ? field : `${where} (read by ${field})`;
}

function list(names: readonly string[]): string {
	return names.map((name) => `'${name}'`).join(', ');
}
