import type { SessionId, SessionRecord, SessionStore } from '../types';
import { copy } from './copy';

/** What the in-memory session store holds: the records, and the index on their token hashes. */
interface SessionIndex {
	readonly byId: Map<SessionId, SessionRecord>;
	readonly byTokenHash: Map<string, SessionId>;
}

/** The session store in memory. */
export function memorySessionStore(): SessionStore {
	const index: SessionIndex = {
		byId: new Map<SessionId, SessionRecord>(),
		byTokenHash: new Map<string, SessionId>(),
	};
	const { byId, byTokenHash } = index;

	return {
		async insertSession(record) {
			if (byId.has(record.id)) return;

			const written = copy(record);
			byId.set(written.id, written);
			byTokenHash.set(written.tokenHash, written.id);
		},

		async findSessionByTokenHash(tokenHash) {
			const id = byTokenHash.get(tokenHash);
			const stored = id === undefined ? undefined : byId.get(id);
			return stored === undefined ? null : copy(stored);
		},

		async extendSession(id, expiresAt) {
			const stored = byId.get(id);
			if (stored === undefined || stored.revokedAt !== null) return null;

			const written: SessionRecord = {
				...stored,
				expiresAt: new Date(expiresAt),
			};
			byId.set(id, written);
			return copy(written);
		},

		async revokeSession(id, at) {
			const stored = byId.get(id);
			if (stored === undefined) return false;

			if (stored.revokedAt === null) revoke(index, id, stored, at);
			return true;
		},

		async revokeUserSessions(userId, at, except) {
			let revoked = 0;

			for (const [id, stored] of byId) {
				if (
					stored.userId === userId &&
					stored.revokedAt === null &&
					id !== except
				) {
					revoke(index, id, stored, at);
					revoked += 1;
				}
			}

			return revoked;
		},

		async deleteUserSessions(userId) {
			return deleteWhere(index, (stored) => stored.userId === userId);
		},

		async deleteExpiredSessions(before) {
			return deleteWhere(
				index,
				(stored) => stored.expiresAt.getTime() <= before.getTime(),
			);
		},
	};
}

function revoke(
	{ byId }: SessionIndex,
	id: SessionId,
	stored: SessionRecord,
	at: Date,
): void {
	byId.set(id, { ...stored, revokedAt: new Date(at) });
}

/** Deletes every session `matches` accepts, from both maps, and counts them. */
function deleteWhere(
	{ byId, byTokenHash }: SessionIndex,
	matches: (stored: SessionRecord) => boolean,
): number {
	let deleted = 0;

	for (const [id, stored] of byId) {
		if (matches(stored)) {
			byId.delete(id);
			byTokenHash.delete(stored.tokenHash);
			deleted += 1;
		}
	}

	return deleted;
}
