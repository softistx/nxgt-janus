import type { TokenStore } from '@nxgt/janus';
import { getCollection } from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { tokens } from '../collections';
import { run, settle } from '../translate';
import { toToken, toTokenDocument } from './records';

export function tokenStore(db: Db): TokenStore {
	const collection = getCollection(db, tokens);
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('tokens', operation, body);

	return {
		insertToken: (record) =>
			run$('insertToken', async () => {
				// `_id` is the hash, the only unique index: a duplicate is a retry.
				await settle(collection.raw.insertOne(toTokenDocument(record)));
			}),

		consumeToken: (tokenHash, kind, at) =>
			run$('consumeToken', async () => {
				// **One conditional write**, answering the document as it was
				// before it. The pipeline keeps a first `spentAt`, so exactly one
				// caller ever reads `spentAt: null`.
				const before = await collection.raw.findOneAndUpdate(
					{ _id: tokenHash, kind },
					[{ $set: { spentAt: { $ifNull: ['$spentAt', at] } } }],
					{ returnDocument: 'before' },
				);
				return before === null ? null : toToken(before);
			}),

		countAttempt: (tokenHash, kind) =>
			run$('countAttempt', async () => {
				// **One conditional write**, answering the document after it: an
				// unspent token gets one more attempt, atomically. A spent one is
				// matched by the second read below, and written nothing.
				const after = await collection.raw.findOneAndUpdate(
					{ _id: tokenHash, kind, spentAt: null },
					{ $inc: { attempts: 1 } },
					{ returnDocument: 'after' },
				);
				if (after !== null) return toToken(after);
				const spent = await collection.raw.findOne({ _id: tokenHash, kind });
				return spent === null ? null : toToken(spent);
			}),

		spendUserTokens: (userId, kind, at, except) =>
			run$('spendUserTokens', async () => {
				// Each document is matched and written in one step, as
				// `consumeToken` does: a token it spends at the same moment is
				// counted by exactly one of the two.
				const result = await collection.raw.updateMany(
					{
						userId,
						kind,
						spentAt: null,
						...(except === undefined ? {} : { _id: { $ne: except } }),
					},
					{ $set: { spentAt: at } },
				);
				return result.modifiedCount;
			}),

		deleteUserTokens: (userId) =>
			run$('deleteUserTokens', async () => {
				const result = await collection.raw.deleteMany({ userId });
				return result.deletedCount;
			}),
	};
}
