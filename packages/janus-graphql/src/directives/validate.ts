/**
 * Decides, when the schema is built, what the directives on one field add up
 * to — and refuses with a `TypeError` what no request could ever pass: a user
 * type `auth` does not know, a `type: []`, restrictions that exclude each
 * other, a `@fresh` whose `maxAge` is not above zero, or a `@permission` the
 * model, the field or the wiring cannot answer (`permission/validate.ts`).
 */

import {
	type FieldShape,
	type PermissionCheck,
	type PermissionWiring,
	permissionCheckOf,
} from './permission/validate';
import type { AuthenticatedUse, FieldDirectives, FreshUse } from './read';
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
	/**
	 * How long ago, in milliseconds, the session may have proved who it is at
	 * most — the smallest `@fresh` that applies; `null` when none does.
	 */
	readonly maxAgeMs: number | null;
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
	const { authenticated, fresh, permission } = directives;
	const [name, first] = firstOf(directives);
	if (first === undefined) return null;
	return {
		where: field.name,
		label: `${name} on ${on(first.where, field.name)}`,
		types: typesOf(field.name, authenticated, known),
		maxAgeMs: maxAgeOf(field.name, fresh),
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

/** The directive a missing `ctx.janus` is reported against: the first checked. */
function firstOf({
	authenticated,
	fresh,
	permission,
}: FieldDirectives): readonly [string, { readonly where: string } | undefined] {
	if (authenticated.length > 0) return ['@authenticated', authenticated[0]];
	if (fresh.length > 0) return ['@fresh', fresh[0]];
	return ['@permission', permission[0]];
}

/** The smallest `maxAge`, in milliseconds, or `null` when no `@fresh` applies. */
function maxAgeOf(field: string, uses: readonly FreshUse[]): number | null {
	let seconds: number | null = null;
	for (const { where, maxAge } of uses) {
		if (!Number.isSafeInteger(maxAge) || maxAge <= 0) {
			throw new TypeError(
				`${PREFIX}: @fresh on ${on(where, field)} asks maxAge: ${maxAge} — write a number of seconds above zero, such as maxAge: 600 for ten minutes`,
			);
		}
		seconds = seconds === null ? maxAge : Math.min(seconds, maxAge);
	}
	return seconds === null ? null : seconds * 1000;
}
