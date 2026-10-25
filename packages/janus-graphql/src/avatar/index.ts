/**
 * The avatar surface, opt-in: `JanusAvatar` for a field of your own types,
 * `toJanusAvatar(user)` for the parent that field returns, and
 * `avatarResolvers({ url })` for the type's fields. Janus keeps only the
 * avatar's id; the bytes, and the route that serves them, are the
 * application's.
 */

import type { UserBase } from '@nxgt/janus';

/** What `toJanusAvatar()` reads: the part of a user this needs, as `@nxgt/janus` types it. */
export type AvatarOwner = Pick<UserBase, 'id' | 'avatar'>;

/** The parent object of a `JanusAvatar` field: the owner's id, and the avatar. */
export interface AvatarParent {
	readonly userId: string;
	readonly id: string;
	readonly updatedAt: Date;
}

/**
 * The parent for an `avatar: JanusAvatar` field of your own type — `null`
 * when the user has none.
 *
 * ```ts
 * Viewer: { avatar: (user) => toJanusAvatar(user) }
 * ```
 *
 * **It checks nothing about who asks**: guard the field (`@permission`, or
 * `can()` in the resolver) before it answers.
 */
export function toJanusAvatar(user: AvatarOwner): AvatarParent | null {
	return user.avatar === null
		? null
		: { userId: user.id, id: user.avatar.id, updatedAt: user.avatar.updatedAt };
}

export type {
	AvatarResolvers,
	AvatarResolversOptions,
} from './resolvers';
export { avatarResolvers } from './resolvers';
export { janusAvatarTypeDefs } from './sdl';
