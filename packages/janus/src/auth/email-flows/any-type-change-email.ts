/**
 * The confirmation of a change of e-mail at the root of an instance with
 * several user types: for the page that follows the link and does not know
 * the user's type.
 */

import type { AnyUser, Context } from '../context';
import { confirmChange } from './change-email';

/**
 * `{ changeEmail: { confirm } }`. Built whatever the types, as each type's
 * flows are; the types show it only when one has an e-mail, and a user of a
 * type without one is `TOKEN_UNKNOWN`. `send` stays on each type: it needs the
 * user's type to validate the address.
 */
export function anyTypeChangeEmail(context: Context): {
	readonly changeEmail: { confirm(token: string): Promise<AnyUser> };
} {
	return {
		changeEmail: {
			confirm: (secret) =>
				confirmChange(context, null, secret, 'changeEmail.confirm'),
		},
	};
}
