import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/** What a deletion of a user's tokens removes, and what it leaves. */
export const tokenDeletionCases: readonly ConformanceCase[] = [
	{
		id: 'tokens.deleteUser',
		group,
		name: 'deletes every token of one user, spent or not, of either kind, and counts them',
		async run({ stores }) {
			const userId = mintId();
			const records = [
				tokenRecord({ userId }),
				tokenRecord({ userId, kind: 'verifyEmail' }),
				tokenRecord({ userId, spentAt: at('2026-01-02T00:00:00.000Z') }),
			];
			const stranger = tokenRecord();
			for (const record of [...records, stranger]) {
				await stores.tokens.insertToken(record);
			}
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.tokens.deleteUserTokens(userId),
				3,
				'deleteUserTokens: how many it deleted',
			);
			for (const record of records) {
				isNull(
					await stores.tokens.consumeToken(record.tokenHash, record.kind, now),
					'consumeToken after deleteUserTokens',
				);
			}
			equal(
				await stores.tokens.consumeToken(
					stranger.tokenHash,
					stranger.kind,
					now,
				),
				stranger,
				'deleteUserTokens should not touch another user',
			);
			equal(
				await stores.tokens.deleteUserTokens(userId),
				0,
				'deleteUserTokens for a user with none answers 0, not a failure',
			);
		},
	},
];
