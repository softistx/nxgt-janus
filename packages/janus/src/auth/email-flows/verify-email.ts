/**
 * Verifying an e-mail: send a token to it, then redeem the token to mark the
 * address verified — or prove it on the application's own proof
 * (`prove-first.ts`).
 */

import type { At } from '../at';
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
import { countMailByUser } from '../mail-requests';
import { refuseStale } from '../one-time';
import type { VerifyEmailApi } from '../types';
import { issueEmailToken, redeemEmailToken } from './email-token';
import { proveFirstFlow } from './prove-first';

/**
 * `verifyEmail` of one user type: `send` a token to its e-mail, then
 * `confirm` it; or `proveFirst`, on the application's own proof.
 */
export function verifyEmailFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): VerifyEmailApi<AnyUser>['verifyEmail'] {
	return {
		async send(user) {
			const where = at('verifyEmail.send');
			const record = await getRecord(context, idOf(user), type.name, where);
			// Counted per user: the application asks for a user it knows.
			await countMailByUser(context, type, 'verifyEmail', record.id, where);
			return issueEmailToken(context, type, 'verifyEmail', record, where);
		},

		confirm: (secret) =>
			confirmVerify(context, type, secret, at('verifyEmail.confirm')),

		proveFirst: proveFirstFlow(context, type, at),
	};
}

/**
 * Redeems a verification token: marks the e-mail verified. `asked` is the type
 * whose `confirm` was called, or null for the root's, where the user's own type
 * answers.
 */
export async function confirmVerify(
	context: Context,
	asked: ResolvedType | null,
	secret: string,
	where: string,
): Promise<AnyUser> {
	const { token, user, type } = await redeemEmailToken(
		context,
		asked,
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
}
