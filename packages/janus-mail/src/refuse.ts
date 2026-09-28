/** A wiring refusal of `janusMail()`: a `TypeError` naming the option. */
export function refuse(message: string): never {
	throw new TypeError(`janusMail: ${message}`);
}
