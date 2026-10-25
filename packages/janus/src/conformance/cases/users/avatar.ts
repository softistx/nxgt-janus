import type { AvatarRecord } from '../../../auth/port/types';
import { equal, isNull } from '../../assert';
import { at, userRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

/** An avatar as the core writes it: an opaque id and the moment it was set. */
const avatar: AvatarRecord = {
	id: 'avatars/ada.3f9c1d',
	updatedAt: at('2026-01-05T10:20:30.456Z'),
};

/** The `updatedAt` of the write under `version`: one day later per version. */
const writtenAt = (version: number): Date =>
	new Date(Date.UTC(2026, 1, 2 + version));

/**
 * An avatar round-trips whole — its id verbatim, its date to the millisecond —
 * a patch that does not name it keeps it, one that names it replaces it, and
 * `null` removes it.
 */
export const avatarSlotCase: ConformanceCase = {
	id: 'users.avatarSlot',
	group: 'users',
	name: 'round-trips an avatar, keeps it when a patch does not name it, replaces it whole when one does, and removes it when the patch names null',
	async run({ stores }) {
		const record = userRecord({ avatar });
		equal(
			await stores.users.insertUser(record),
			record,
			'insertUser should answer an avatar as written: its id verbatim and its updatedAt to the millisecond',
		);
		equal(
			(await stores.users.findUser(record.id))?.avatar,
			avatar,
			'findUser should answer the avatar insertUser wrote',
		);

		const kept = await stores.users.updateUser(
			record.id,
			{ updatedAt: writtenAt(0) },
			0,
		);
		equal(kept.avatar, avatar, 'updateUser not naming avatar should keep it');

		const replacement: AvatarRecord = {
			id: 'avatars/ada.b7e204',
			updatedAt: at('2026-02-03T04:05:06.789Z'),
		};
		const replaced = await stores.users.updateUser(
			record.id,
			{ updatedAt: writtenAt(1), avatar: replacement },
			1,
		);
		equal(
			replaced.avatar,
			replacement,
			'updateUser naming avatar should replace it whole',
		);
		equal(
			(await stores.users.findUser(record.id))?.avatar,
			replacement,
			'findUser after updateUser naming avatar should answer it as written',
		);

		isNull(
			(
				await stores.users.updateUser(
					record.id,
					{ updatedAt: writtenAt(2), avatar: null },
					2,
				)
			).avatar,
			'updateUser with avatar: null should remove the avatar',
		);
		isNull(
			(await stores.users.findUser(record.id))?.avatar,
			'findUser after updateUser with avatar: null should answer no avatar',
		);

		const absent = userRecord();
		isNull(
			(await stores.users.insertUser(absent)).avatar,
			'insertUser should answer a user with no avatar as avatar: null',
		);
	},
};
