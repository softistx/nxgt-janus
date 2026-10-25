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
	const former: { id: string | null } = { id: null };
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record) => {
			former.id = record.avatar?.id ?? null;
			return former.id === null ? null : { avatar: null };
		},
	);
	if (former.id !== null) {
		await emit(context, 'user.avatarRemoved', written, written.updatedAt, {
			formerAvatarId: former.id,
		});
	}
	return toUser(written);
}
