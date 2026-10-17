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
import { passwordChanged } from '../password-written';
import type { UserRecord } from '../port/types';
import { countSignInAttempt, restartSignInCount } from '../sign-in-attempts';
import type { UserRef, WriteOptions } from '../types';

/**
 * Replaces the password after checking the current one, in the write that
 * replaces it — so the check is made on the very record the write replaces.
 *
 * Each call counts one attempt in the sign-in throttle of the user's login,
 * the one `signIn` counts in, so a caller holding a session cannot try
 * current passwords without limit, and the wrong guesses of both add up. The
 * attempt is counted on the record the write reads, before the password is
 * compared (a user with no password included, so the answer does not tell
 * the two apart); past the limit the call is refused with `retryAfter`, the
 * right password included, and nothing is compared or written. The write
 * runs its callback once, so a call counts exactly once. A user with no login
 * string, or the throttle off, counts nothing. A change that is written
 * restarts the count, as a sign-in that opens a session does — after
 * {@link passwordChanged}, so an outage restarting it cannot skip what the
 * old password opened.
 */
export async function changePassword(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	change: { readonly current: string; readonly next: string },
	options: WriteOptions | undefined,
	where: string,
): Promise<UserRecord> {
	const rule = passwordRule(type, where);
	checkPassword(type, change?.next, where);
	const hasher = requireHasher(context, where);

	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		async (record, now) => {
			const login =
				rule.login in record.fields ? record.fields[rule.login] : undefined;
			if (typeof login === 'string') {
				await countSignInAttempt(context, type, rule.normalize(login), where);
			}
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
	await passwordChanged(context, written);
	await restartSignInCount(context, type, written, where);
	return written;
}
