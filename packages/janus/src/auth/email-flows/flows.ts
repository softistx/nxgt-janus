import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type { ResetPasswordApi, VerifyEmailApi } from '../types';
import { resetPasswordFlows } from './reset-password';
import { verifyEmailFlows } from './verify-email';

/**
 * The e-mail flows: send a one-time token by e-mail, then confirm it —
 * verifying the address, or resetting the password. Both confirm the same
 * way: spend the token, read the user, and check the address again on the
 * very record the write replaces.
 */
export function emailFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
): VerifyEmailApi<AnyUser> & ResetPasswordApi<AnyUser> {
	return {
		verifyEmail: verifyEmailFlows(context, type, at),
		resetPassword: resetPasswordFlows(context, type, at),
	};
}
