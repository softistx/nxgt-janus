/**
 * From a configuration to its types: its user types, their users, their login
 * and e-mail fields, and what their writes take.
 *
 * The helpers without a doc comment are exported for the sibling files only;
 * `./index` does not re-export them.
 *
 * The types derived from a configuration, in which the rest of the surface is
 * written; `./index` gathers them.
 */

import type { MultiTypeConfig, SingleTypeConfig } from '../config';
import type { StandardSchemaV1 } from '../standard-schema';
import type { User } from './user';

export type OutputOf<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferOutput<S>
	: never;
type InputOf<S> = S extends StandardSchemaV1
	? StandardSchemaV1.InferInput<S>
	: never;

/** The single-type form, seen as one entry of `users`. */
export type SingleAsType<C extends SingleTypeConfig> = {
	readonly schema: C['user'];
	readonly password: C['password'];
	readonly email: C['email'];
};

/** Every user type a configuration declares, by name. */
export type TypesOf<C> = C extends MultiTypeConfig
	? C['users']
	: C extends SingleTypeConfig
		? { readonly user: SingleAsType<C> }
		: never;

/**
 * Every **top-level, required** key of `T` whose value is a string: what a
 * login or an e-mail may name. Required, because a login read from an
 * optional field is a user who may have no way to sign in.
 */
export type RequiredStringKeys<T> = {
	[K in keyof T & string]-?: object extends Pick<T, K>
		? never
		: T[K] extends string
			? K
			: never;
}[keyof T & string];

/** The login field of one user type, or `never` without a password. */
export type LoginOf<Def> = Def extends {
	readonly password: { readonly login: infer L extends string };
}
	? L
	: never;

/**
 * The e-mail field of one user type: the one it names, or `'email'` when the
 * schema has a required string `email` — or `never`, and then the e-mail flows
 * do not exist on it.
 */
export type EmailOf<Def> = Def extends {
	readonly email: infer E extends string;
}
	? E
	: Def extends { readonly schema: infer S }
		? 'email' extends RequiredStringKeys<OutputOf<S>>
			? 'email'
			: never
		: never;

export type UserOfType<Name extends string, Def> = Def extends {
	readonly schema: infer S;
}
	? User<Name, OutputOf<S>>
	: never;

/** Every user of a configuration: a union discriminated by `type`. */
export type UserOf<C> = {
	[K in keyof TypesOf<C> & string]: UserOfType<K, TypesOf<C>[K]>;
}[keyof TypesOf<C> & string];

/** What `create`, `signUp` and `update` take for one user type. */
export type FieldsInput<Def> = Def extends { readonly schema: infer S }
	? InputOf<S>
	: never;
