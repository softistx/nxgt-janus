/**
 * The names a configuration gives: a user type's, and the fields it points
 * at — each camelCase, and none of them one `janus` sets itself.
 */

import { RESERVED_FIELDS } from './reserved';

/** A type name, or a field name: camelCase, as every key in this package. */
export const NAME = /^[A-Za-z][A-Za-z0-9]*$/;

/** The field a configuration key names, or a wiring refusal. */
export function fieldName(field: unknown, where: string): string {
	if (typeof field !== 'string' || !NAME.test(field)) {
		throw new TypeError(
			`${where} must name a top-level field of the schema, such as "email"`,
		);
	}
	if ((RESERVED_FIELDS as readonly string[]).includes(field)) {
		throw new TypeError(`${where}: "${field}" is a field janus sets itself`);
	}
	return field;
}
