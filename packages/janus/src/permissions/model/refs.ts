/** What `can()` takes as a subject and as an object, typed from the model. */

import type { NotASet, SetOf } from '../../subjects/subject';
import type { ModelConfig } from './config';
import type { FromField } from './from-field';
import type {
	NamesOf,
	ObjectTypeOf,
	RelationDefOf,
	RelationsOf,
	TypesOf,
	UserTypeOf,
} from './names';

/** What `can()` accepts for an object type: its relations and its permissions. */
export type CheckableOf<
	C extends ModelConfig,
	T extends ObjectTypeOf<C>,
> = NamesOf<TypesOf<C>, T>;

/** The fields an object of type `T` must carry: those its `fromField`s read. */
export type FieldsOf<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	[R in RelationsOf<TypesOf<C>, T>]: RelationDefOf<
		TypesOf<C>,
		T,
		R
	> extends FromField<infer F, string>
		? F
		: never;
}[RelationsOf<TypesOf<C>, T>];

/**
 * An object, as `can()` takes it: its type and id, and **every field a
 * `fromField` of its type reads** — required, so an object passed without
 * them is a compile error rather than a silent denial. `null` is a field
 * holding nobody.
 */
export type ObjectRef<C extends ModelConfig, T extends ObjectTypeOf<C>> = {
	readonly type: T;
	readonly id: string;
} & { readonly [F in FieldsOf<C, T>]: string | null };

/**
 * A subject: a user from `janus()` as it is, an object, or a subject set —
 * one `setOf()` made on an object type and one of its relations. A set on a
 * user type the model does not also declare under `types` has no relation to
 * name, and is refused here as at run time.
 */
export type SubjectRef<C extends ModelConfig> =
	| ({
			readonly type: UserTypeOf<C> | ObjectTypeOf<C>;
			readonly id: string;
	  } & NotASet)
	| {
			[T in ObjectTypeOf<C>]: SetOf<T, RelationsOf<TypesOf<C>, T> & string>;
	  }[ObjectTypeOf<C>];
