/**
 * What `janus()` accepts, and how it is resolved at run time.
 *
 * The types refuse first, on the offending key (`../types/checks.ts`). What
 * follows at run time is the net for JavaScript callers, and every refusal is a
 * bare `TypeError`: a configuration is written when the application is wired,
 * never from a request.
 *
 * Gathered here from the files beside this one.
 */

export type { PasswordHasher } from './hasher';
export type {
	CookieConfig,
	DevicesConfig,
	JanusConfig,
	MultiTypeConfig,
	SecondFactorConfig,
	SignInConfig,
	SignInThrottleConfig,
	SingleTypeConfig,
} from './janus-config';
export { type Normalize, normalizeEmail } from './normalize';
export type { PasswordConfig } from './password-config';
export { RESERVED_FIELDS, RESERVED_TYPES, SINGLE_TYPE } from './reserved';
export { resolveConfig } from './resolve-config';
export type { ResolvedConfig, ResolvedType } from './resolved-config';
export type {
	FieldsJson,
	SessionConfig,
	UserSchema,
	UserTypeConfig,
} from './user-type';
