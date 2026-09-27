import type { AnyUser } from '../context';
import type { UserRecord } from '../port/types';
import type {
	PasswordApi,
	ResetPasswordApi,
	SecondFactorApi,
	SignInCodeApi,
	SignInResult,
	UserTypeApi,
	VerifyEmailApi,
} from '../types';

/** A user's fields as a flow receives them, before any schema read them. */
export type Input = Record<string, unknown>;

/** Everything one user type answers. Which flows it has is decided by its types; all are built. */
export type AnyTypeApi = UserTypeApi<AnyUser, Input> &
	PasswordApi<AnyUser, Input, string, SignInResult<AnyUser>> &
	SecondFactorApi<AnyUser> &
	SignInCodeApi<AnyUser, SignInResult<AnyUser>> &
	VerifyEmailApi<AnyUser> &
	ResetPasswordApi<AnyUser>;

/** Names an operation in a message: `create`, or `patient.create` when there are several types. */
export type At = (operation: string) => string;

/** What a sign-in answers once the user proved who they are: `secondFactorFlows`'s `finish`. */
export type Finish = (
	record: UserRecord,
	where: string,
) => Promise<SignInResult<AnyUser>>;
