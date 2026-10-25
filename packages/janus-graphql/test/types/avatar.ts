/**
 * What the compiler refuses in the avatar surface, measured: each
 * `@ts-expect-error` below is a plausible mistake, and fails the typecheck
 * the day it compiles. The last block must keep compiling.
 */

import { avatarResolvers, toJanusAvatar } from '../../src/index';

export async function avatars() {
	// 38. Resolvers with no route to point the url at.
	// @ts-expect-error — `url` is required: it is the application's own route.
	avatarResolvers({});

	// 39. A url that is not a string.
	// @ts-expect-error — `url` answers the string the client is given.
	avatarResolvers({ url: (_avatar, size) => size });

	// 40. A url that answers a promise: the resolver does not await it.
	// @ts-expect-error — `url` is synchronous; resolve the route before wiring.
	avatarResolvers({ url: async () => '/avatars/1' });

	// 41. A parent made from something that is not a user with an avatar.
	// @ts-expect-error — `toJanusAvatar()` reads `user.avatar`, which this has not.
	toJanusAvatar({ id: 'user-id' });
}

// ── And the shapes that MUST keep compiling ─────────────────────────────────

export function allowed(user: { id: string; avatar: null }) {
	const resolvers = avatarResolvers({
		url: ({ userId, id }, size) =>
			`/avatars/${userId}/${size}?v=${encodeURIComponent(id)}`,
	});
	return [resolvers.JanusAvatar.updatedAt, toJanusAvatar(user)];
}
