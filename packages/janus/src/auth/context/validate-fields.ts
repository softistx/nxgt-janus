/**
 * A user's fields, validated against the type's schema and answered as the
 * port holds them — or refused, reporting where and never the values.
 */

import { type Issue, UserInvalidError } from '../../errors/janus-error';
import { isStorable, UNSTORABLE } from '../../stores/storable';
import { RESERVED_FIELDS, type ResolvedType } from '../config';
import type { Json, JsonObject } from '../port/types';
import type { StandardSchemaV1 } from '../standard-schema';

/**
 * Validates fields against the type's schema, and answers them as the port
 * holds them: an `undefined` property dropped, at every depth.
 */
export async function validateFields(
	type: ResolvedType,
	input: unknown,
	where: string,
): Promise<JsonObject> {
	const result = await type.schema['~standard'].validate(input);

	const issues: Issue[] =
		result.issues === undefined
			? []
			: result.issues.map((issue) => ({
					path: storablePrefix((issue.path ?? []).map(segmentKey)),
					message: issue.message,
				}));

	// A schema that passes unknown keys through would let a request set `id` or
	// `active` among the fields. `toUser` would shadow them anyway; refusing
	// them says so to whoever sent them.
	if (result.issues === undefined) {
		const value = result.value as Record<string, unknown>;
		for (const key of RESERVED_FIELDS) {
			if (Object.hasOwn(value, key)) {
				issues.push({ path: [key], message: 'set by janus, not by a request' });
			}
		}
		unstorableIn(value, [], issues);
	}

	if (issues.length > 0) {
		// The message reports how many and where, never the values: a field may
		// be anything the application chose to store, including something
		// private.
		throw new UserInvalidError(
			`${where}: the fields do not match the ${type.name} schema (${issues.length} issue${issues.length === 1 ? '' : 's'}, at ${issues.map((i) => i.path.join('.') || '(root)').join(', ')})`,
			{ issues, userType: type.name },
		);
	}

	return withoutUndefined((result as { value: unknown }).value) as JsonObject;
}

/** Pushes an issue for every key and every string no store can keep. */
function unstorableIn(
	value: unknown,
	path: (string | number)[],
	issues: Issue[],
): void {
	if (typeof value === 'string') {
		if (!isStorable(value)) issues.push({ path, message: UNSTORABLE });
		return;
	}
	if (Array.isArray(value)) {
		for (const [index, inner] of value.entries()) {
			unstorableIn(inner, [...path, index], issues);
		}
		return;
	}
	if (typeof value === 'object' && value !== null) {
		for (const [key, inner] of Object.entries(value)) {
			// The key itself stays out of the path: the path reaches the message,
			// and a NUL has no business in a log line.
			if (!isStorable(key)) {
				issues.push({ path, message: `a key ${UNSTORABLE}` });
			} else {
				unstorableIn(inner, [...path, key], issues);
			}
		}
	}
}

/**
 * A path up to its first key no store can keep: the path reaches the message,
 * and a NUL has no business in a log line.
 */
function storablePrefix(path: (string | number)[]): (string | number)[] {
	const cut = path.findIndex(
		(segment) => typeof segment === 'string' && !isStorable(segment),
	);
	return cut === -1 ? path : path.slice(0, cut);
}

function segmentKey(
	segment: PropertyKey | StandardSchemaV1.PathSegment,
): string | number {
	const key = typeof segment === 'object' ? segment.key : segment;
	return typeof key === 'number' ? key : String(key);
}

function withoutUndefined(value: unknown): Json {
	if (Array.isArray(value)) return value.map(withoutUndefined);

	if (typeof value === 'object' && value !== null) {
		const out: Record<string, Json> = {};
		for (const [key, inner] of Object.entries(value)) {
			if (inner !== undefined) out[key] = withoutUndefined(inner);
		}
		return out;
	}

	return value as Json;
}
