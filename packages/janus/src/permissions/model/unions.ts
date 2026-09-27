/** Working on unions of types: what `ctx.ts` and `can.ts` share. */

export type UnionToIntersection<U> = (
	U extends unknown
		? (union: U) => void
		: never
) extends (intersection: infer I) => void
	? I
	: never;
