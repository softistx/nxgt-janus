import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser, writeUser } from '../context';
import { emit } from '../events';
import type { UserRef, WriteOptions } from '../types';
import { avatarIdOf } from './id';

/**
 * Points the user at the image the application stored under `avatar.id`.
 * Setting the id the user already has writes nothing and reports nothing:
 * the image is the same, and so is the record. A different one is reported
 * with the id it replaced, the only place the application learns which image
 * to delete.
 */
export async function setAvatar(
	context: Context,
	type: ResolvedType,
	user: UserRef,
	avatar: unknown,
	options: WriteOptions | undefined,
	where: string,
): Promise<AnyUser> {
	const id = avatarIdOf(avatar, where);
	const outcome: { former: string | null; changed: boolean } = {
		former: null,
		changed: false,
	};
	const written = await writeUser(
		context,
		user,
		type,
		options,
		where,
		(record, now) => {
			outcome.former = record.avatar?.id ?? null;
			if (outcome.former === id) return null;
			outcome.changed = true;
			return { avatar: { id, updatedAt: now } };
		},
	);
	if (outcome.changed) {
		await emit(context, 'user.avatarChanged', written, written.updatedAt, {
			formerAvatarId: outcome.former,
		});
	}
	return toUser(written);
}
