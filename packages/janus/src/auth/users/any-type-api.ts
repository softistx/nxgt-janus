import type { AnyUser } from '../context';
import type {
	MagicLinkApi,
	PasswordApi,
	ResetPasswordApi,
	SecondFactorApi,
	SignInCodeApi,
	SignInResult,
	StepUpApi,
	StepUpByApp,
	StepUpByEmail,
	UserTypeApi,
	VerifyEmailApi,
} from '../types';
import type { Input } from './flow-types';

/** Everything one user type answers. Which flows it has is decided by its types; all are built. */
export type AnyTypeApi = UserTypeApi<AnyUser, Input> &
	PasswordApi<AnyUser, Input, string, SignInResult<AnyUser>> &
	SecondFactorApi<AnyUser> &
	SignInCodeApi<AnyUser, SignInResult<AnyUser>> &
	MagicLinkApi<AnyUser, SignInResult<AnyUser>> &
	StepUpApi<AnyUser, StepUpByEmail<AnyUser> | StepUpByApp<AnyUser>> &
	VerifyEmailApi<AnyUser> &
	ResetPasswordApi<AnyUser>;
