/**
 * The user a one-time token was issued to, and the type that owns them — the
 * lookup the e-mail flows' redemptions share.
 */

import type { ResolvedType } from '../config';
import { type Context, findRecord } from '../context';
import { unknownOneTime } from '../one-time';
import type { TokenRecord, UserRecord } from '../port/types';

/**
 * The user `token` was issued to and their type: `type` when it is given, the
 * user's own when it is null. A user gone since, or of another type than the
 * one given, is as good as no token: `TOKEN_UNKNOWN`.
 */
export async function ownerOf(
	context: Context,
	type: ResolvedType | null,
	token: TokenRecord,
	where: string,
): Promise<{ user: UserRecord; type: ResolvedType }> {
	const user = await findRecord(context, token.userId, type?.name ?? null);
	const owner = type ?? context.config.types.get(user?.type ?? '');
	if (user === null || owner === undefined)
		throw unknownOneTime(where, 'token');
	return { user, type: owner };
}
