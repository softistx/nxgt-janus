/**
 * The avatar surface, opt-in: `JanusAvatar` for a field of your own types,
 * `toJanusAvatar(user)` for the parent that field returns, and
 * `avatarResolvers({ url })` for the type's fields. Janus keeps only the
 * avatar's id; the bytes, and the route that serves them, are the
 * application's.
 */

import { GraphQLError } from 'graphql';

/** What `toJanusAvatar()` reads: the part of a user this needs. */
export interface AvatarOwner {
	readonly id: string;
	readonly avatar: { readonly id: string; readonly updatedAt: Date } | null;
}

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

/** What `avatarResolvers()` takes. */
export interface AvatarResolversOptions {
	/**
	 * The URL of your own route that streams the image of `avatar.userId` at
	 * `size` — which checks the session and access first. Put the avatar's id
	 * in it (`?v=${avatar.id}`), so a new upload is a new URL for the browser's
	 * cache. `size` is already a positive integer.
	 */
	readonly url: (
		avatar: { readonly userId: string; readonly id: string },
		size: number,
	) => string;
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
 *   ...avatarResolvers({ url: ({ userId, id }, size) => `/avatars/${userId}/${size}?v=${id}` }),
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
					throw new GraphQLError('size must be a positive integer', {
						extensions: { code: 'BAD_USER_INPUT', http: { status: 400 } },
					});
				}
				return options.url(avatar, size);
			},
		},
	};
}
