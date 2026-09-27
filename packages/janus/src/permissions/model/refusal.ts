/** How a refusal reads: a sentence the compiler prints on the offending name. */

export type Refusal<Text extends string, Expected> = {
	readonly [K in Text]: Expected;
};

/**
 * The same names, spelled out: a union the compiler prints as its members —
 * `"patient" | "staff" | "team#members"` — rather than as the alias that
 * computed it, so an error lists what the name could have been.
 */
export type Spelled<U> = [U] extends [infer V extends string]
	? { [K in V]: K }[V]
	: never;
