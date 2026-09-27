/**
 * The checks, as types: what `janus` intersects into its parameter so a wrong
 * configuration is refused on the offending key.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type {
	MultiTypeConfig,
	RESERVED_FIELDS,
	RESERVED_TYPES,
	UserSchema,
} from '../config';
import type { OutputOf, RequiredStringKeys } from './inference';

/**
 * Makes a value that names no key of `Keys` unassignable, and says why on that
 * key.
 *
 * The reason is the **key** of an object type, and the valid names its value.
 * A string-literal message would not survive: `'emial' & 'message'` reduces to
 * `never`, which collapses the whole object and loses the sentence — measured
 * while writing `from` in the first surface. A string intersected with an
 * object does not reduce, so the compiler prints both.
 */
type CheckName<V, Keys extends string, What extends string> = [V] extends [Keys]
	? unknown
	: {
			readonly [K in `"${V & string}" is not ${What}; name one of`]: Keys;
		};

type Reserved<S> = Extract<keyof OutputOf<S>, (typeof RESERVED_FIELDS)[number]>;

/** The checks on one user type: its login, its e-mail, and its field names. */
type CheckType<Def, SchemaKey extends string> = (Def extends {
	readonly password: { readonly login: infer L };
}
	? {
			readonly password: {
				readonly login: CheckName<
					L,
					RequiredStringKeys<OutputOf<SchemaOf<Def, SchemaKey>>>,
					'a required string field'
				>;
			};
		}
	: unknown) &
	(Def extends { readonly email: infer E }
		? {
				readonly email: CheckName<
					E,
					RequiredStringKeys<OutputOf<SchemaOf<Def, SchemaKey>>>,
					'a required string field'
				>;
			}
		: unknown) &
	([Reserved<SchemaOf<Def, SchemaKey>>] extends [never]
		? unknown
		: {
				readonly [K in SchemaKey]: {
					readonly [M in `"${Reserved<SchemaOf<Def, SchemaKey>> & string}" is a field janus sets itself; rename it`]: never;
				};
			});

type SchemaOf<Def, SchemaKey extends string> = Def extends {
	readonly [K in SchemaKey]: infer S extends UserSchema;
}
	? S
	: never;

/**
 * The compile-time checks `janus` intersects into its parameter.
 *
 * `janus` infers its argument, so an excess-property check never fires;
 * intersecting `C & Checked<C>` makes a wrong value unassignable **on the
 * offending key**, with the reason as the type the compiler prints. The pattern
 * is measured in `nxgt-data/packages/mongo-kit/src/config/types.ts`.
 */
export type Checked<C> = C extends MultiTypeConfig
	? {
			readonly users: {
				readonly [K in keyof C['users']]: K extends (typeof RESERVED_TYPES)[number]
					? {
							readonly [M in `"${K & string}" cannot name a user type: janus() answers a method of that name`]: never;
						}
					: CheckType<C['users'][K], 'schema'>;
			};
		}
	: CheckType<C, 'user'>;
