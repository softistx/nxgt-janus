/**
 * The avatar of a user: the id of the image the application stored for them,
 * set and removed by every user type, and at the root of an instance with
 * several.
 *
 * Part of what `janus()` hands back; `./index` gathers it.
 */

import type { UserRef, WriteOptions } from './user';

/**
 * What every user type answers for the avatar of its users. **Janus stores
 * only the id the application chose** — an opaque string, never parsed — and
 * never the image: storing, processing, serving and deleting the bytes is the
 * application's. Read it back as `user.avatar` (`{ id, updatedAt } | null`).
 *
 * These are server-side methods, like `update`: **no access check, no
 * freshness check**. Whether a request may change this user's avatar, and who
 * may see it, is for the application to decide before it calls them.
 *
 * ```ts
 * const id = crypto.randomUUID();        // a fresh id for every upload
 * await storage.put(`avatars/${id}`, bytes);   // the bytes first …
 * await auth.user.avatar.set(userId, { id }); // … then the record
 * ```
 */
export interface AvatarApi<U> {
	readonly avatar: {
		/**
		 * Points the user at the image stored under `avatar.id`, and answers the
		 * written user. `updatedAt` of the avatar is now.
		 *
		 * **Write the image to your storage first, then call this.** If this
		 * fails, the image is an orphan nobody points at; the other order could
		 * leave a record pointing at bytes that were never written.
		 *
		 * **Use a fresh id for every upload**, such as `crypto.randomUUID()`.
		 * Reusing the id of the current image lets a storage `replace` overwrite
		 * the image the user is showing, and the later removal of the former
		 * image — the same id — delete the new one. The id doubles as the
		 * cache-buster: a new image has a new id.
		 *
		 * Setting the id the user already has writes nothing and emits nothing.
		 * Otherwise `user.avatarChanged` is emitted with `formerAvatarId` — the
		 * id replaced, `null` for a first avatar — which is how the application
		 * deletes the former image.
		 *
		 * `AVATAR_ID_INVALID` when `id` is not a non-empty string of at most 512
		 * characters, before anything is read. `NOT_FOUND` for an unknown user;
		 * `VERSION_CONFLICT` when `ifVersion` is stale.
		 */
		set(
			user: UserRef,
			avatar: { readonly id: string },
			options?: WriteOptions,
		): Promise<U>;
		/**
		 * Clears the user's avatar, and answers the written user. A user with no
		 * avatar writes nothing and emits nothing. Otherwise `user.avatarRemoved`
		 * is emitted with `formerAvatarId`, the id it had: delete that image
		 * from your storage. `NOT_FOUND` for an unknown user; `VERSION_CONFLICT`
		 * when `ifVersion` is stale.
		 */
		remove(user: UserRef, options?: WriteOptions): Promise<U>;
	};
}

/**
 * What an instance with several user types answers at its root: the same
 * `avatar`, for the page that holds a user's id and does not know their type.
 * It reads the user to find the type, then does what that type's `avatar`
 * does; the answer's `type` says which it was. `NOT_FOUND` for a user of no type.
 */
export type AnyTypeAvatarApi<U> = AvatarApi<U>;
