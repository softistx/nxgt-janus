/**
 * Signing in a user the application proved by its own means — an
 * invitation token it issued, a channel of its own: no credential checked
 * here, so nothing to count, nothing to send and nothing to spend.
 */

import { UserInactiveError } from '../errors/janus-error';
import type { At } from './at';
import type { ResolvedType } from './config';
import { type AnyUser, type Context, getRecord, refId } from './context';
import { deviceHint, reportNewDevice } from './devices';
import type { Finish } from './email-sign-in';
import type { ProvenSignInApi, SignInResult } from './types';

/**
 * `signInProven` for one user type: the user read by id — `NOT_FOUND` for
 * nobody, as `get` — refused when inactive, then finished as every sign-in
 * is, by `secondFactor.finish`: a session, or a challenge for an active
 * factor.
 *
 * No throttle is counted and no count restarted, no token issued or spent,
 * no e-mail proved: the proof is the application's, and links and codes
 * already sent keep working.
 */
export function provenSignInFlows(
	context: Context,
	type: ResolvedType,
	at: At,
	finish: Finish,
): ProvenSignInApi<AnyUser, SignInResult<AnyUser>> {
	return {
		async signInProven(user, options) {
			const where = at('signInProven');
			const device = deviceHint(context, options, where);
			const record = await getRecord(context, refId(user), type.name, where);
			if (!record.active) {
				throw new UserInactiveError(`${where}: the user is inactive`, {
					userId: record.id,
					userType: type.name,
				});
			}
			const result = await finish(record, where, device);
			await reportNewDevice(context, result);
			return result;
		},
	};
}
