/**
 * The confirmation of an e-mail at the root of an instance with several user
 * types: for the page that follows the link and does not know the user's type.
 */

import type { AnyUser, Context } from '../context';
import { confirmVerify } from './verify-email';

/**
 * `{ verifyEmail: { confirm } }`. Built whatever the types, as each type's
 * flows are; the types show it only when one has an e-mail, and a user of a
 * type without one is `TOKEN_UNKNOWN`. `send` and `proveFirst` stay on each
 * type: they need the user's type.
 */
export function anyTypeVerifyEmail(context: Context): {
	readonly verifyEmail: { confirm(token: string): Promise<AnyUser> };
} {
	return {
		verifyEmail: {
			confirm: (secret) =>
				confirmVerify(context, null, secret, 'verifyEmail.confirm'),
		},
	};
}
