/** What `grant()` and `revoke()` write: the stored relations, and who may hold them. */

import type { CursorPage } from '../../pagination/cursor-page';
import type {
	Entity,
	NotASet,
	RelationTuple,
	SetOf,
} from '../../subjects/subject';
import type { ModelConfig } from './config';
import type {
	ObjectTypeOf,
	RelationDefOf,
	StoredRelationsOf,
	TypesOf,
	UserTypeOf,
} from './names';

/** The relations of an object type that `grant` can write: not its `fromField`s. */
export type GrantableOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
> = StoredRelationsOf<TypesOf<C>, T>;

/**
 * Who may be granted relation `R` on an object of type `T`: an entity of each
 * subject type it names, and a subject set for each set it names — made by
 * `setOf()` when the set is on a user type, since a user passed as it is stays
 * that user.
 */
export type HolderOf<C extends ModelConfig, T extends ObjectTypeOf<C>, R> =
	RelationDefOf<TypesOf<C>, T, R> extends readonly (infer E)[]
		? E extends `${infer SetType}#${infer SetRelation}`
			? SetType extends UserTypeOf<C>
				? SetOf<SetType, SetRelation>
				: {
						readonly type: SetType;
						readonly id: string;
						readonly relation: SetRelation;
					}
			: { readonly type: E; readonly id: string } & NotASet
		: never;

/** Writes one tuple, or removes it: typed like `can()`. */
export type Grant<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	R extends GrantableOf<C, T>,
>(
	object: { readonly type: T; readonly id: string },
	relation: R,
	subject: HolderOf<C, T, R>,
) => Promise<void>;

/**
 * Makes `subjects` the only holders of `relation` on `object`, in one write:
 * typed as {@link Grant}'s `subject`, as an array. Answers the tuples added
 * and removed. Two concurrent calls on the same object and relation are not
 * serialised: the result can hold the union of both adds.
 */
export type Replace<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	R extends GrantableOf<C, T>,
>(
	object: { readonly type: T; readonly id: string },
	relation: R,
	subjects: readonly HolderOf<C, T, R>[],
) => Promise<{ added: RelationTuple[]; removed: RelationTuple[] }>;

/** Which holders a page of `holders()` lists, and how many. */
export interface HoldersPage {
	/** The `nextCursor` of the previous page; absent or `null` for the first. */
	readonly after?: string | null;
	/** Between 1 and 100; 20 when absent. */
	readonly first?: number;
	/** Keeps the holders whose id contains this text, ignoring case. Absent or `''` for all. */
	readonly search?: string;
	/**
	 * Keeps the holders it answers `true` for, asked of each in order until the
	 * page is full. For what the relation store cannot see: the holder's email
	 * or name, read from the user store. Paging stays right; it is asked of one
	 * holder at a time and stops once the page is full. A selective predicate
	 * costs more reads, up to {@link HoldersPage.scanLimit} holders
	 * per call. Exclusive with `matchesMany`.
	 */
	readonly matches?: (holder: Entity) => boolean | Promise<boolean>;
	/**
	 * `matches` for a batch: called with up to 100 holders in order, it answers
	 * one boolean per holder, in the same order, so a caller reads a page's
	 * users in one query. Exclusive with `matches`.
	 */
	readonly matchesMany?: (
		holders: readonly Entity[],
	) => readonly boolean[] | Promise<readonly boolean[]>;
	/**
	 * With `matches` or `matchesMany`: the most holders one call looks at, a
	 * positive integer or `Infinity`; 500 when absent. When it is spent before
	 * the page is full, the call answers the holders kept so far (possibly
	 * none) with a `nextCursor` to resume from, so a page may hold fewer than
	 * `first` and still not be the last: only a `null` `nextCursor` is.
	 */
	readonly scanLimit?: number;
}

/**
 * The single entities holding `relation` on `object`, ordered by type then id,
 * by pages: typed as {@link Grant}'s `object` and `relation`. Subject sets are
 * not listed. A failure throws, as for `list()`.
 */
export type Holders<C extends ModelConfig> = <
	T extends ObjectTypeOf<C>,
	R extends GrantableOf<C, T>,
>(
	object: { readonly type: T; readonly id: string },
	relation: R,
	options?: HoldersPage,
) => Promise<CursorPage<Entity>>;
