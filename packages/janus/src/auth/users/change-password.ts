import { CredentialError } from '../../errors/janus-error';
import type { ResolvedType } from '../config';
import {
	type Context,
	checkPassword,
	passwordMatches,
	passwordRule,
	requireHasher,
	writeUser,
} from '../context';
import { endWhatThePasswordOpened } from '../password-written';
import type { UserRecord } from '../port/types';
import type { UserRef, WriteOptions } from '../types';

/**
 * Replaces the password after checking the current one, in the write that
 * replaces it — so the check is made on the very record the write replaces.
 */
export async function changePassword(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	change: { readonly current: string; readonly next: string },
	options: WriteOptions | undefined,
	where: string,
): Promise<UserRecord> {
	passwordRule(type, where);
	checkPassword(type, change?.next, where);
	const hasher = requireHasher(context, where);

	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		async (record, now) => {
			if (
				record.password === null ||
				!(await passwordMatches(context, record, change.current, where))
			) {
				throw new CredentialError(
					'CREDENTIALS_INVALID',
					`${where}: the current password does not match`,
					{
						reason: record.password === null ? 'noPassword' : 'wrongPassword',
						userId: record.id,
						userType: type.name,
					},
				);
			}
			return {
				password: {
					hash: await hasher.hash(change.next),
					updatedAt: now,
				},
			};
		},
	);
	await endWhatThePasswordOpened(context, written.id);
	return written;
}
