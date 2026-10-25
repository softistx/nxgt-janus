import type { At } from '../at';
import type { ResolvedType } from '../config';
import type { AnyUser, Context } from '../context';
import type { AvatarApi } from '../types';
import { removeAvatar } from './remove';
import { setAvatar } from './set';

/** `avatar` of one user type: `set` the image its user points at, or `remove` it. */
export function avatarFlows(
	context: Context,
	type: ResolvedType,
	at: At,
): AvatarApi<AnyUser>['avatar'] {
	return {
		set: (user, avatar, options) =>
			setAvatar(context, type, user, avatar, options, at('avatar.set')),
		remove: (user, options) =>
			removeAvatar(context, type, user, options, at('avatar.remove')),
	};
}
