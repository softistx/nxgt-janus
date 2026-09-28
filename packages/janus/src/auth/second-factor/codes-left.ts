import type { ResolvedType } from '../config';
import { type Context, getRecord, idOf } from '../context';
import type { UserRef } from '../types';
import { isActive } from './factor';

/**
 * How many recovery codes the user still holds, read from their record: the
 * count `secondFactor.recover` answers, for whoever did not see that answer —
 * a `user.recoveryCodeUsed` listener, a security settings page.
 *
 * `null` when the user has no active factor: none, or one still waiting for
 * its first code, holds no codes to count. An unknown id, or a user of
 * another type, is `NOT_FOUND`; a store that fails throws. Writes nothing.
 */
export async function recoveryCodesLeftOf(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	where: string,
): Promise<number | null> {
	const record = await getRecord(context, idOf(user), type.name, where);
	const factor = record.secondFactor;
	return isActive(factor) ? factor.recoveryCodes.length : null;
}
