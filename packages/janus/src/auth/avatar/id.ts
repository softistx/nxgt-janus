import { AvatarIdInvalidError } from '../../errors/janus-error';
import { isStorable } from '../../stores/storable';

/** The longest avatar id janus stores: room for a key or a URL, not for a document. */
export const AVATAR_ID_MAX = 512;

/**
 * The id `avatar.set` was given, or `AVATAR_ID_INVALID`. Janus never parses
 * it: it only has to be something every store can keep. Decided before any
 * read, since it arrives from the application's own upload step — and the
 * message names the shape, never the value.
 */
export function avatarIdOf(avatar: unknown, where: string): string {
	const id =
		typeof avatar === 'object' && avatar !== null
			? (avatar as { readonly id?: unknown }).id
			: undefined;
	if (
		typeof id !== 'string' ||
		id === '' ||
		id.length > AVATAR_ID_MAX ||
		!isStorable(id)
	) {
		throw new AvatarIdInvalidError(
			`${where}: the avatar id must be a non-empty string of at most ${AVATAR_ID_MAX} characters that every store can keep`,
			{ operation: where },
		);
	}
	return id;
}
