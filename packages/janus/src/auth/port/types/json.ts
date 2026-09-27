/**
 * What a store round-trips in a user's fields: JSON, and nothing else.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./index`.
 */

/**
 * A value a store must be able to round-trip byte for byte.
 *
 * JSON and nothing else. A `Date` inside fields round-trips through MongoDB and
 * not through a JSON column or Redis, so an adapter could pass the conformance
 * suite on one database and corrupt fields on the next. The record's own
 * timestamps are `Date`s, because every adapter stores those in a column it
 * chose for them.
 */
export type Json =
	| string
	| number
	| boolean
	| null
	| readonly Json[]
	| JsonObject;

/**
 * An object of {@link Json} values.
 *
 * An `interface` declared by the application is not assignable to this — an
 * index signature is only satisfied by a type alias. The core never asks a
 * caller to write one: it casts at the boundary, after validation.
 */
export type JsonObject = { readonly [key: string]: Json };
