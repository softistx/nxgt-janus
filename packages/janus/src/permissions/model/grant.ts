/** What `grant()` and `revoke()` write: the stored relations, and who may hold them. */

import type { NotASet, SetOf } from '../../subjects/subject';
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
