/**
 * Verifying an e-mail: send a token to it, then redeem the token to mark the
 * address verified.
 */

import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	getRecord,
	idOf,
	toUser,
	writeUser,
} from '../context';
import { emit } from '../events';
import { refuseStale } from '../one-time';
import type { VerifyEmailApi } from '../types';
import { issueEmailToken, redeemEmailToken } from './email-token';

/** `verifyEmail` of one user type: `send` a token to its e-mail, then `confirm` it. */
export function verifyEmailFlows(
	context: Context,
	type: ResolvedType,
	at: (operation: string) => string,
): VerifyEmailApi<AnyUser>['verifyEmail'] {
	return {
		async send(user) {
			const where = at('verifyEmail.send');
			const record = await getRecord(context, idOf(user), type.name, where);
			return issueEmailToken(context, type, 'verifyEmail', record, where);
		},

		async confirm(secret) {
			const where = at('verifyEmail.confirm');
			const { token, user } = await redeemEmailToken(
				context,
				type,
				'verifyEmail',
				secret,
				where,
			);
			let newlyVerified = false;
			const written = await writeUser(
				context,
				user.id,
				type,
				undefined,
				where,
				(record, now) => {
					// Checked again on the record written: an e-mail changed
					// since the read above is not the one the link proved.
					refuseStale(type, record, token, where, 'token');
					newlyVerified = record.emailVerifiedAt === null;
					return { emailVerifiedAt: now };
				},
			);
			if (newlyVerified) {
				await emit(context, 'user.emailVerified', written, written.updatedAt);
			}
			return toUser(written);
		},
	};
}
