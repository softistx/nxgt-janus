/**
 * The token an e-mail flow sends and redeems: issued for the user's current
 * e-mail, and refused on redemption when that e-mail is not the one it was
 * sent to any more.
 */

import { NotFoundError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import { type Context, emailOf, findRecord } from '../context';
import {
	issueOneTime,
	refuseStale,
	spendOneTime,
	unknownOneTime,
} from '../one-time';
import type { TokenKind, TokenRecord, UserRecord } from '../port/types';
import type { IssuedToken } from '../types';

/**
 * Spends a token and says why it cannot be used, when it cannot. A user
 * gone since, or of another type, is as good as no token; a token sent to
 * an e-mail the user no longer has is stale.
 */
export async function redeemEmailToken(
	context: Context,
	type: ResolvedType,
	kind: TokenKind,
	secret: string,
	where: string,
): Promise<{ token: TokenRecord; user: UserRecord }> {
	const token = await spendOneTime(context, secret, kind, where, 'token');
	const user = await findRecord(context, token.userId, type.name);
	if (user === null) throw unknownOneTime(where, 'token');

	refuseStale(type, user, token, where, 'token');
	return { token, user };
}

/** Issues a one-time token for the user's current e-mail. */
export async function issueEmailToken(
	context: Context,
	type: ResolvedType,
	kind: 'verifyEmail' | 'resetPassword',
	user: UserRecord,
	where: string,
): Promise<IssuedToken> {
	const email = emailOf(type, user.fields);
	if (email === null) {
		throw new NotFoundError(`${where}: the user has no e-mail`, {
			userId: user.id,
			userType: type.name,
			operation: where,
		});
	}

	const { secret, expiresAt } = await issueOneTime(context, {
		kind,
		userId: user.id,
		address: email,
		ttlMs: context.config.tokenTtlMs[kind],
	});
	return { token: secret, email, expiresAt };
}
