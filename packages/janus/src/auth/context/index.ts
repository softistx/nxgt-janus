/**
 * What every operation of the core shares: the resolved configuration, the
 * guarded stores, the clock, the hashers — and the handful of steps every
 * operation takes the same way.
 *
 * Internal and degenericised: fields are a `JsonObject` here, and `janus()`
 * casts once, at the boundary, after the schema has validated them.
 *
 * Gathered here from the files beside this one.
 */

export { type Context, createContext } from './create-context';
export { emailOf, holderOfEmail, loginsOf } from './logins';
export {
	checkPassword,
	passwordMatches,
	passwordRule,
	rehashed,
	requireHasher,
} from './password';
export { findRecord, getRecord, writeUser } from './records';
export { type AnyUser, idOf, toUser } from './user';
export { validateFields } from './validate-fields';
