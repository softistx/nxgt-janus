/** The phrases the schema-time refusals share. */

export const PREFIX = 'applyJanusDirectives()';

/** `Query.me`, or `Record (read by Record.title)` for a type's directive. */
export function on(where: string, field: string): string {
	return where === field ? field : `${where} (read by ${field})`;
}

/** `'a', 'b'`. */
export function list(names: readonly string[]): string {
	return names.map((name) => `'${name}'`).join(', ');
}
