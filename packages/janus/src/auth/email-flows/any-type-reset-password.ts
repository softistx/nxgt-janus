/**
 * The confirmation of a password reset at the root of an instance with several
 * user types: for the page that follows the link and does not know the user's
 * type.
 */

import type { AnyUser, Context } from '../context';
import { confirmReset } from './confirm-reset';

/**
 * `{ resetPassword: { confirm } }`. Built whatever the types, as each type's
 * flows are; the types show it only when one has a password and an e-mail, and
 * a user of a type without a password is `TOKEN_UNKNOWN`. `request` and
 * `prepare` stay on each type: they need the type to find the holder of the
 * address.
 */
export function anyTypeResetPassword(context: Context): {
	readonly resetPassword: {
		confirm(token: string, password: string): Promise<AnyUser>;
	};
} {
	return {
		resetPassword: {
			confirm: (secret, password) =>
				confirmReset(context, null, secret, password, 'resetPassword.confirm'),
		},
	};
}
