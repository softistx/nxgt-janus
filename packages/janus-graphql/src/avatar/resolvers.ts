/**
 * The resolvers of `JanusAvatar`, keyed as `createSchema` expects: `updatedAt`
 * as an ISO-8601 string, and `url(size:)` from the application's own route.
 */

import { GraphQLError } from 'graphql';
import type { AvatarParent } from './index';

/** What `avatarResolvers()` takes. */
export interface AvatarResolversOptions {
	/**
	 * The URL of your own route that streams the image of `avatar.userId` at
	 * `size` — which checks the session and access first. Put the avatar's id
	 * in it (`?v=${encodeURIComponent(avatar.id)}`; ids are the application's
	 * own, so encode them), so a new upload is a new URL for the browser's
	 * cache. `avatar` is the parent `toJanusAvatar()` made — at least `userId` and `id`
	 * are what a route needs. `size` is already a positive integer.
	 */
	readonly url: (avatar: AvatarParent, size: number) => string;
}

/** The resolver map for `JanusAvatar`, keyed as `createSchema` expects. */
export interface AvatarResolvers {
	// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
	readonly JanusAvatar: {
		readonly updatedAt: (avatar: AvatarParent) => string;
		readonly url: (
			avatar: AvatarParent,
			args: { readonly size: number },
		) => string;
	};
}

/**
 * The resolvers of `JanusAvatar`: `updatedAt` as an ISO-8601 string, and
 * `url(size:)` from your `url` function. A `size` that is not a positive
 * integer is refused `BAD_USER_INPUT`, 400, before `url` is called; which
 * sizes exist is your route's to decide — it answers 404 for the others.
 *
 * ```ts
 * const resolvers = {
 *   ...avatarResolvers({ url: ({ userId, id }, size) => `/avatars/${userId}/${size}?v=${encodeURIComponent(id)}` }),
 *   Viewer: { avatar: (user) => toJanusAvatar(user) },
 * };
 * ```
 */
export function avatarResolvers(
	options: AvatarResolversOptions,
): AvatarResolvers {
	return {
		// biome-ignore lint/style/useNamingConvention: a resolver map's keys are the schema's type names.
		JanusAvatar: {
			updatedAt: (avatar) => avatar.updatedAt.toISOString(),
			url: (avatar, { size }) => {
				if (!Number.isSafeInteger(size) || size < 1) {
					// Not denial(): that one speaks of access (401/403/404), this is a bad argument.
					throw new GraphQLError('size must be a positive integer', {
						extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
					});
				}
				return options.url(avatar, size);
			},
		},
	};
}
