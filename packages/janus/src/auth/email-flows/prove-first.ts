/**
 * Proving an e-mail on the application's own proof of the inbox — an
 * invitation token it issued to the address — with the ending a first
 * sign-in by link or code gives an e-mail never proved (`../first-proof`).
 */

import { UserInactiveError } from '../../errors/janus-error';
import type { At } from '../at';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	getRecord,
	refId,
	toUser,
} from '../context';
import { proveFirstEmail } from '../first-proof';
import type { VerifyEmailApi } from '../types';

/**
 * `verifyEmail.proveFirst` for one user type: the user read by id —
 * `NOT_FOUND` for nobody, as `signInProven` — refused when inactive, then,
 * when the e-mail was never proved, `proveFirstEmail` exactly as
 * `magicLink.confirm` and `signInCode.confirm` run it, decided the same way:
 * on the record read, `emailVerifiedAt === null`. An e-mail already proved
 * is answered as it is, with nothing written.
 *
 * No throttle is counted and no count restarted, no e-mail sent and no
 * token issued; the only tokens spent are the ones `proveFirstEmail`
 * spends, what the password opened.
 */
export function proveFirstFlow(
	context: Context,
	type: ResolvedType,
	at: At,
): VerifyEmailApi<AnyUser>['verifyEmail']['proveFirst'] {
	return async (user) => {
		const where = at('verifyEmail.proveFirst');
		const record = await getRecord(context, refId(user), type.name, where);
		if (!record.active) {
			throw new UserInactiveError(`${where}: the user is inactive`, {
				userId: record.id,
				userType: type.name,
			});
		}
		if (record.emailVerifiedAt !== null) {
			return { user: toUser(record), proved: false };
		}
		const proved = await proveFirstEmail(context, type, record, where);
		return { user: toUser(proved), proved: true };
	};
}
