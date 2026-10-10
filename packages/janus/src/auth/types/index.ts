/**
 * What `janus()` hands back, typed from the configuration it was given.
 *
 * The generic form is gathered here from the files beside this one; the
 * implementation works on a degenericised mirror and casts once, in
 * `auth/janus.ts`. That is `nxgt-data`'s shape, and it
 * keeps each schema's type travelling through every public method without
 * dragging a type parameter through every internal function.
 */

export type { Checked } from './checks';
export type {
	IssuedCode,
	IssuedToken,
	ResetPasswordApi,
	SignInCodeApi,
	VerifyEmailApi,
} from './email-flows';
export type {
	EmailOf,
	LoginOf,
	RequiredStringKeys,
	TypesOf,
	UserOf,
} from './inference';
export type { Janus, SharedApi, TypeApi } from './janus';
export type { MagicLinkApi } from './magic-link';
export type { PasswordApi } from './password';
export type { PreparedCode, PreparedRequest } from './prepared';
export type {
	RecoveredSignIn,
	RecoveryCodesIssued,
	SecondFactorApi,
	SecondFactorEnrolment,
} from './second-factor';
export type {
	Authenticated,
	HeaderRecord,
	RequestLike,
	Session,
} from './session';
export type {
	SecondFactorRequired,
	SignedIn,
	SignInOptions,
	SignInResult,
} from './sign-in';
export type { StepUpApi, StepUpByApp, StepUpByEmail } from './step-up';
export type { User, UserBase, UserRef, WriteOptions } from './user';
export type { UserTypeApi } from './user-type';
