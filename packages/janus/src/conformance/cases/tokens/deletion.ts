import { mintId } from '../../../ids/id';
import { equal, isNull, ok } from '../../assert';
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
	{
		id: 'tokens.deleteExpired',
		group,
		name: 'deletes tokens whose expiry is at or before the instant, spent or not, and only those',
		needs: 'deleteExpiredTokens',
		async run({ stores }) {
			const collect = stores.tokens.deleteExpiredTokens;
			ok(collect !== undefined, 'deleteExpiredTokens should be present');
			const lapsedAt = at('2026-01-10T00:00:00.000Z');
			const laterAt = at('2026-01-10T00:00:00.001Z');
			const spentAt = at('2026-01-05T00:00:00.000Z');
			const lapsed = tokenRecord({ expiresAt: lapsedAt });
			const lapsedSpent = tokenRecord({ expiresAt: lapsedAt, spentAt });
			const living = tokenRecord({ expiresAt: laterAt });
			const livingSpent = tokenRecord({ expiresAt: laterAt, spentAt });
			for (const record of [lapsed, lapsedSpent, living, livingSpent]) {
				await stores.tokens.insertToken(record);
			}

			equal(
				await collect?.call(stores.tokens, lapsedAt),
				2,
				'deleteExpiredTokens: how many it deleted, spent ones included',
			);
			for (const record of [lapsed, lapsedSpent]) {
				isNull(
					await stores.tokens.countAttempt(record.tokenHash, record.kind),
					'countAttempt after deleteExpiredTokens',
				);
			}
			equal(
				await stores.tokens.countAttempt(living.tokenHash, living.kind),
				{ ...living, attempts: 1 },
				'deleteExpiredTokens should keep a token one millisecond short of lapsing',
			);
			equal(
				await stores.tokens.countAttempt(
					livingSpent.tokenHash,
					livingSpent.kind,
				),
				livingSpent,
				'deleteExpiredTokens should keep a spent token until it lapses, still spent',
			);
			equal(
				await collect?.call(stores.tokens, lapsedAt),
				0,
				'deleteExpiredTokens with nothing lapsed answers 0, not a failure',
			);
		},
	},
];
