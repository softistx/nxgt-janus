import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import type { UserRef, WriteOptions } from '../types';
import { isActive } from './factor';

/**
 * Removes the factor, active or waiting. Reported only when an active one
 * went: a user who had none, or whose factor never received its first code,
 * was never asked for one, and still is not.
 */
export async function disableFactor(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	options: WriteOptions | undefined,
	where: string,
): Promise<AnyUser> {
	let wasActive = false;
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			wasActive = isActive(record.secondFactor);
			return { secondFactor: null };
		},
	);
	if (wasActive) {
		await emit(
			context,
			'user.secondFactorDisabled',
			written,
			written.updatedAt,
		);
	}
	return toUser(written);
}
