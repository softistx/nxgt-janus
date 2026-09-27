/**
 * A user as application code sees it, how a method names one, and the
 * version check a write that follows a read may carry.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { Id } from '../../ids/id';

/** What every user carries beside the application's own fields. */
export interface UserBase<Type extends string = string> {
	readonly id: Id;
	/** Which user type — `'patient'`, `'staff'`, or `'user'` in the one-type form. */
	readonly type: Type;
	/** Whether the user proved they hold their current e-mail. */
	readonly emailVerified: boolean;
	/** `false`: the user is kept, and every sign-in is refused. */
	readonly active: boolean;
	/**
	 * Whether a password is set. **The hash itself never reaches a user**: no
	 * type that reaches a request handler carries it, and `test/types/` pins
	 * that.
	 */
	readonly hasPassword: boolean;
	/**
	 * Whether a second factor is **active**: enrolled, and proved with a first
	 * code. A factor still waiting for that code does not count, and `signIn`
	 * does not ask for it.
	 */
	readonly hasSecondFactor: boolean;
	/** One more on every write: what `ifVersion` is compared against. */
	readonly version: number;
	readonly createdAt: Date;
	readonly updatedAt: Date;
}

/** A user as application code sees it: their fields, at the top level, and {@link UserBase}. */
export type User<
	Type extends string = string,
	Fields = object,
> = Readonly<Fields> & UserBase<Type>;

/** A user, or their id: every method that takes one takes either. */
export type UserRef = string | { readonly id: string };

/** Options every write that follows a read may take. */
export interface WriteOptions {
	/**
	 * The version the user must still hold, as read. A write to a user who
	 * changed since is `VERSION_CONFLICT`, and nothing is written.
	 */
	readonly ifVersion?: number;
}
