/**
 * The avatar at the root of an instance with several user types: for the
 * page that holds a user's id and does not know the user's type.
 */

import { NotFoundError } from '../../errors/janus-error';
import { type AnyUser, type Context, getRecord, idOf } from '../context';
import type { AvatarApi, UserRef } from '../types';
import { avatarIdOf } from './id';
import { removeAvatar } from './remove';
import { setAvatar } from './set';

/**
 * `{ avatar: { set, remove } }`: reads the user's record to find their type,
 * then does what that type's `avatar` does — the same write, event and
 * refusals. A user nobody holds is `NOT_FOUND`, whatever the type.
 */
export function anyTypeAvatar(context: Context): AvatarApi<AnyUser> {
	const typeOf = async (user: UserRef, where: string) => {
		const id = idOf(user);
		const record = await getRecord(context, id, null, where);
		const type = context.config.types.get(record.type);
		// A record of a type this configuration does not declare is not one of
		// its users: as good as absent.
		if (type === undefined) {
			throw new NotFoundError(`${where}: no user has this id`, {
				userId: id,
				operation: where,
			});
		}
		return type;
	};

	return {
		avatar: {
			async set(user, avatar, options) {
				const where = 'avatar.set';
				// Before the read: a refused id reaches no store.
				avatarIdOf(avatar, where);
				const type = await typeOf(user, where);
				return setAvatar(context, type, user, avatar, options, where);
			},
			async remove(user, options) {
				const where = 'avatar.remove';
				const type = await typeOf(user, where);
				return removeAvatar(context, type, user, options, where);
			},
		},
	};
}
