/**
 * The names `janus` keeps for itself: the single-type form's type name, the
 * keys it sets on every user, and the methods on its answer.
 */

/** The type name the single-type form gives its users. */
export const SINGLE_TYPE = 'user';

/**
 * Keys `janus` sets on every user, so a schema may not declare them.
 * `password` too: it is taken beside the fields, and never stored among them.
 */
export const RESERVED_FIELDS = [
	'id',
	'type',
	'emailVerified',
	'active',
	'hasPassword',
	'hasSecondFactor',
	'version',
	'createdAt',
	'updatedAt',
	'password',
] as const;

/** Names on `janus()`'s answer, so a user type may not take one. */
export const RESERVED_TYPES = [
	'authenticate',
	'signOut',
	'signOutEverywhere',
	'findUser',
	'getUser',
	'cookie',
	'collectExpired',
	'types',
] as const;
