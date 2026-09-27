/** What `list()` can reverse, and its signature. */

import type { CursorPage } from '../../pagination/cursor-page';
import type { CheckArgs } from './can';
import type { ModelConfig } from './config';
import type { FromField, Lookup } from './from-field';
import type {
	ArrowTargets,
	NameOfRule,
	ObjectTypeOf,
	RelationDefOf,
	RelationsOf,
	TypesOf,
} from './names';
import type { CheckableOf, SubjectRef } from './refs';
import type { Refusal } from './refusal';

/** `'record.doctor'` when relation `R` of `T` is a `fromField` with no `lookup`. */
type GapOfRelation<Ts, T, R> =
	RelationDefOf<Ts, T, R> extends { readonly lookup: Lookup }
		? never
		: RelationDefOf<Ts, T, R> extends FromField
			? `${T & string}.${R & string}`
			: never;

type GapOfName<Ts, T, N, Seen> = N extends `${infer R}->${infer P}`
	?
			| GapOfRelation<Ts, T, R>
			| GapOfPermission<Ts, ArrowTargets<Ts, T, R>, P, Seen>
	: GapOfPermission<Ts, T, N, Seen>;

/**
 * The `fromField`s without a `lookup` that `list(…, P, T)` would have to
 * reverse — through `P`'s rules, the names they reach, and arrows. A subject
 * set never reaches one: `defineModel` refuses that.
 */
type GapOfPermission<Ts, T, P, Seen> = T extends keyof Ts & string
	? P extends string
		? `${T}.${P}` extends Seen
			? never
			: P extends RelationsOf<Ts, T>
				? GapOfRelation<Ts, T, P>
				: Ts[T] extends { readonly permits: infer Ps }
					? P extends keyof Ps
						? Ps[P] extends readonly (infer E)[]
							? GapOfName<Ts, T, NameOfRule<E>, Seen | `${T}.${P}`>
							: never
						: never
					: never
		: never
	: never;

/** Every `fromField` without a `lookup` that `list(…, P, T)` would reach; `never` when none. */
export type LookupGap<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = GapOfPermission<TypesOf<C>, T, P, never>;

/**
 * What a permission must also be for `list()`: reversible. Checked name by
 * name, so that while `P` is still every name of `T` — an editor asking what
 * to complete — the names `list()` can answer survive the intersection, and
 * only those.
 */
type ListCheck<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> = P extends string
	? [LookupGap<C, T, P>] extends [never]
		? P
		: Refusal<
				`list cannot reverse ${LookupGap<C, T, P>}: give that fromField a lookup`,
				never
			>
	: never;

/** Where a page of `list()` starts, and how much it holds. */
export interface ListPage {
	/** The `nextCursor` of the previous page; absent or `null` for the first. */
	readonly after?: string | null;
	/** Between 1 and 100; 20 when absent. */
	readonly limit?: number;
}

/** `CheckArgs`, with a page. */
type ListArgs<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
	P extends string,
> =
	CheckArgs<C, T, P> extends [infer O]
		? [options: O & ListPage]
		: CheckArgs<C, T, P> extends [options?: infer O]
			? [options?: O & ListPage]
			: never;

/**
 * The signature of `list()`: the ids of the objects of `type` on which
 * `subject` holds `permission`, in ascending order, by pages. Typed like
 * `can()`, and refuses a permission that reaches a `fromField` with no
 * `lookup`: nothing could find the objects whose field names the subject.
 */
export type List<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	P extends CheckableOf<C, T>,
>(
	subject: SubjectRef<C> | null,
	permission: P & ListCheck<C, T, P>,
	type: T,
	...options: ListArgs<C, T, P>
) => Promise<CursorPage<string>>;
