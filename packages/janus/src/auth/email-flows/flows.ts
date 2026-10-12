/** The e-mail flows of one user type, assembled from the files beside this one. */

import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type {
	ChangeEmailApi,
	ResetPasswordApi,
	VerifyEmailApi,
} from '../types';
import { changeEmailFlows } from './change-email';
import { resetPasswordFlows } from './reset-password';
import { verifyEmailFlows } from './verify-email';

/**
 * The e-mail flows: send a one-time token by e-mail, then confirm it —
 * verifying the address, resetting the password, or moving to a new address. Both confirm the same
 * way: spend the token, read the user, and check the address again on the
 * very record the write replaces.
 */
export function emailFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): VerifyEmailApi<AnyUser> &
	ResetPasswordApi<AnyUser> &
	ChangeEmailApi<AnyUser> {
	return {
		verifyEmail: verifyEmailFlows(context, type, at),
		resetPassword: resetPasswordFlows(context, type, at),
		changeEmail: changeEmailFlows(context, type, at),
	};
}
