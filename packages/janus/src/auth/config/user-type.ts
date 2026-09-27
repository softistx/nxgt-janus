/**
 * One user type, as `janus()` takes it: its schema, how it signs in, and how
 * long its sessions live.
 */

import type { Duration } from '../../time/duration';
import type { StandardSchemaV1 } from '../standard-schema';
import type { PasswordConfig } from './password';

/**
 * What a user schema may produce: JSON, where an object property may also be
 * `undefined` — which is what every validator's optional field produces.
 *
 * The core drops an `undefined` property before a store sees the fields, so the
 * port stays strict JSON: an optional field left out is **absent** in the
 * store, and reads back absent, which the schema's output type already allows.
 */
export type FieldsJson =
	| string
	| number
	| boolean
	| null
	| readonly FieldsJson[]
	| { readonly [key: string]: FieldsJson | undefined };

/**
 * A user type's schema: any Standard Schema — Zod 4, Valibot, ArkType — whose
 * output is an object of JSON. A `Date` round-trips through one store and not
 * the next, so a schema that produces one is refused at compile time.
 */
export type UserSchema = StandardSchemaV1<
	unknown,
	{ readonly [key: string]: FieldsJson | undefined }
>;

/** How long a session lives, and when it is renewed. */
export interface SessionConfig {
	/** `'7d'` when absent. */
	readonly lifespan?: Duration;
	/**
	 * `authenticate` renews a session once this much has passed since it was
	 * opened or last renewed — a sliding session, written at most once per
	 * period. `'1d'` when absent; `false` for a fixed lifespan.
	 */
	readonly renewAfter?: Duration | false;
}

/** One user type: its schema, and how it signs in. */
export interface UserTypeConfig {
	readonly schema: UserSchema;
	readonly password?: PasswordConfig;
	/**
	 * The field holding the user's e-mail, which `verifyEmail` and
	 * `resetPassword` send to. `'email'` when absent — and when the schema has
	 * no required string `email` either, those two flows do not exist on the
	 * type.
	 */
	readonly email?: string;
	readonly session?: SessionConfig;
	/**
	 * Recorded on every user written, and read by nothing yet. Bump it when the
	 * schema tightens, and the users validated against the old one can be found.
	 * `'1'` when absent.
	 */
	readonly schemaVersion?: string;
}
