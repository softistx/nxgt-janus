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
import { proveFirstEmail } from '../first-proof';
import { countMailByUser } from '../mail-requests';
import { refuseStale } from '../one-time';
import type { VerifyEmailApi, VerifyEmailOptions } from '../types';
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

		confirm: (secret, options) =>
			confirmVerify(context, type, secret, at('verifyEmail.confirm'), options),

		proveFirst: proveFirstFlow(context, type, at),
	};
}

/**
 * Redeems a verification token: marks the e-mail verified. `asked` is the type
 * whose `confirm` was called, or null for the root's, where the user's own type
 * answers. With `options.firstProof`, an address never proved is proved as
 * `magicLink.confirm` does (`../first-proof`): the password and the second
 * factor set before the proof are dropped and every session is revoked.
 */
export async function confirmVerify(
	context: Context,
	asked: ResolvedType | null,
	secret: string,
	where: string,
	options?: VerifyEmailOptions,
): Promise<AnyUser> {
	const { token, user, type } = await redeemEmailToken(
		context,
		asked,
		'verifyEmail',
		secret,
		where,
	);
	if (options?.firstProof === true && user.emailVerifiedAt === null) {
		// The token was checked against this very record; the proof is
		// written under its version, so an address changed since conflicts.
		return toUser(await proveFirstEmail(context, type, user, where));
	}
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
