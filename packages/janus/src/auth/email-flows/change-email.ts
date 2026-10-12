/**
 * Changing a user's e-mail: send a token to the NEW address, then redeem it
 * to move the user there — verified, since the link reached its inbox.
 */

import { UserInactiveError } from '../../errors/janus-error';
import type { At } from '../at';
import type { ResolvedType } from '../config';
import {
	type AnyUser,
	type Context,
	emailOf,
	getRecord,
	idOf,
	toUser,
	writeUser,
} from '../context';
import { emit } from '../events';
import { countMailByAddress, countMailByUser } from '../mail-requests';
import type { UserRecord } from '../port/types';
import type { ChangeEmailApi } from '../types';
import { emailChanged, fieldsPatch } from '../users/fields-patch';
import {
	issueChangeEmailToken,
	newAddressOf,
	redeemChangeEmailToken,
	refuseMoved,
} from './change-email-token';

const inactive = (type: ResolvedType, user: UserRecord, where: string) =>
	new UserInactiveError(`${where}: the user is inactive`, {
		userId: user.id,
		userType: type.name,
	});

/** `changeEmail` of one user type: `send` to the new address, then `confirm`. */
export function changeEmailFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): ChangeEmailApi<AnyUser>['changeEmail'] {
	return {
		async send(user, email) {
			const where = at('changeEmail.send');
			const record = await getRecord(context, idOf(user), type.name, where);
			if (!record.active) throw inactive(type, record, where);
			// Validated first, then counted per user and per validated address,
			// all before anything is issued: a refusal spends nothing.
			const address = await newAddressOf(type, record, email, where);
			await countMailByUser(context, type, 'changeEmail', record.id, where);
			await countMailByAddress(context, type, 'changeEmail', address, where);
			return issueChangeEmailToken(context, type, record, address);
		},

		async confirm(secret) {
			return confirmChange(context, type, secret, at('changeEmail.confirm'));
		},
	};
}

/** Redeems a change's token: the write, then the events it earned. */
async function confirmChange(
	context: Context,
	type: ResolvedType,
	secret: string,
	where: string,
): Promise<AnyUser> {
	const { token, user } = await redeemChangeEmailToken(
		context,
		type,
		secret,
		where,
	);
	if (!user.active) throw inactive(type, user, where);

	// The record the write replaced, read in its callback, as `update` does.
	const seen: { replaced: UserRecord | null } = { replaced: null };
	const written = await writeUser(
		context,
		user.id,
		type,
		undefined,
		where,
		async (record, now) => {
			// Checked again on the record written, as for verifyEmail.
			if (!record.active) throw inactive(type, record, where);
			refuseMoved(type, record, token, secret, where);
			seen.replaced = record;
			const patch = await fieldsPatch(
				type,
				record,
				{ [type.email]: token.address },
				where,
			);
			// Verified by the link that reached the new address; an address
			// already verified keeps the date it was.
			const proved =
				record.emailVerifiedAt === null ||
				emailChanged(type, record.fields, patch.fields);
			return proved ? { ...patch, emailVerifiedAt: now } : patch;
		},
	);
	const { replaced } = seen;
	const moved =
		replaced !== null && emailChanged(type, replaced.fields, written.fields);
	if (replaced !== null && moved) {
		await emit(context, 'user.emailChanged', written, written.updatedAt, {
			formerEmail: emailOf(type, replaced.fields),
		});
	}
	if (moved || replaced?.emailVerifiedAt === null) {
		await emit(context, 'user.emailVerified', written, written.updatedAt);
	}
	return toUser(written);
}
