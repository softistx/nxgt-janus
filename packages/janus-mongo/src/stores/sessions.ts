import type { SessionStore } from '@nxgt/janus';
import { getCollection } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { sessions } from '../collections';
import { run, settle, unexpectedDuplicate } from '../translate';
import { toSession, toSessionDocument } from './records';

export function sessionStore(db: Db): SessionStore {
	const collection = getCollection(db, sessions);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('sessions', operation, body);

	return {
		insertSession: (record) =>
			run$('insertSession', async () => {
				const outcome = await settle(
					collection.raw.insertOne(toSessionDocument(record)),
				);
				if (!('duplicate' in outcome)) return;

				// Idempotent under retry: a session with this id is already there.
				if ((await collection.findById(record.id)) !== undefined) return;
				throw unexpectedDuplicate(
					'sessions',
					'insertSession',
					outcome.duplicate,
				);
			}),

		findSessionByTokenHash: (tokenHash) =>
			run$('findSessionByTokenHash', async () => {
				const found = await collection.findFirst({ tokenHash });
				return found === undefined ? null : toSession(found);
			}),

		extendSession: (id, expiresAt) =>
			run$('extendSession', async () => {
				// `revokedAt: null` in the filter: an extension racing a revocation
				// matches nothing, and never brings the session back.
				const written = await collection.raw.findOneAndUpdate(
					{ _id: id, revokedAt: null },
					{ $set: { expiresAt } },
					{ returnDocument: 'after' },
				);
				return written === null ? null : toSession(written);
			}),

		revokeSession: (id, at) =>
			run$('revokeSession', async () => {
				// A pipeline, so a session already revoked keeps its first
				// `revokedAt` and still counts as matched.
				const result = await collection.raw.updateOne({ _id: id }, [
					{ $set: { revokedAt: { $ifNull: ['$revokedAt', at] } } },
				]);
				return result.matchedCount === 1;
			}),

		revokeUserSessions: (userId, at, except) =>
			run$('revokeUserSessions', async () => {
				const result = await collection.raw.updateMany(
					except === undefined
						? { userId, revokedAt: null }
						: { userId, revokedAt: null, _id: { $ne: except } },
					{ $set: { revokedAt: at } },
				);
				return result.modifiedCount;
			}),

		deleteUserSessions: (userId) =>
			run$('deleteUserSessions', async () => {
				const result = await collection.raw.deleteMany({ userId });
				return result.deletedCount;
			}),
	};
}
