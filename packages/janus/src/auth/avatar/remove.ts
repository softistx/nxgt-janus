import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import type { UserRef, WriteOptions } from '../types';

/**
 * Clears the user's avatar. A user who had none writes nothing and reports
 * nothing; one who had is reported with the id it had, so the application can
 * delete that image.
 */
export async function removeAvatar(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	options: WriteOptions | undefined,
	where: string,
): Promise<AnyUser> {
	const outcome: { former: string | null } = { former: null };
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			outcome.former = record.avatar?.id ?? null;
			return outcome.former === null ? null : { avatar: null };
		},
	);
	if (outcome.former !== null) {
		await emit(context, 'user.avatarRemoved', written, written.updatedAt, {
			formerAvatarId: outcome.former,
		});
	}
	return toUser(written);
}
