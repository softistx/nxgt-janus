/**
 * What `janus()` hands back, typed from the configuration it was given.
 *
 * The generic form lives here; the implementation works on a degenericised
 * mirror and casts once, in `janus.ts`. That is `nxgt-data`'s shape, and it
 * keeps each schema's type travelling through every public method without
 * dragging a type parameter through every internal function.
 */

export type { Checked } from './surface/checks';
export type {
	IssuedCode,
	IssuedToken,
	ResetPasswordApi,
	SignInCodeApi,
	VerifyEmailApi,
} from './surface/email';
export type {
	EmailOf,
	LoginOf,
	RequiredStringKeys,
	TypesOf,
	UserOf,
} from './surface/inference';
export type { Janus, SharedApi, TypeApi } from './surface/janus';
export type { PasswordApi } from './surface/password';
export type {
	SecondFactorApi,
	SecondFactorEnrolment,
} from './surface/second-factor';
export type {
	Authenticated,
	HeaderRecord,
	RequestLike,
	Session,
} from './surface/session';
export type {
	SecondFactorRequired,
	SignedIn,
	SignInResult,
} from './surface/sign-in';
export type { User, UserBase, UserRef, WriteOptions } from './surface/user';
export type { UserTypeApi } from './surface/user-type';
