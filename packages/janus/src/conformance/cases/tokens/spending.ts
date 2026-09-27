import { mintId } from '../../../ids/id';
import { equal } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * How the tokens of one user and one kind are spent together: all but the one
 * named, each once, even against a redemption.
 */
export const tokenSpendingCases: readonly ConformanceCase[] = [
	{
		id: 'tokens.spendUserTokens',
		group,
		name: 'spends every unspent token of one user and one kind, and counts them, leaving the rest as they were',
		async run({ stores }) {
			const userId = mintId();
			const first = tokenRecord({ userId, kind: 'signInCode' });
			const second = tokenRecord({ userId, kind: 'signInCode', attempts: 2 });
			const spentBefore = at('2026-01-02T00:00:00.000Z');
			const spent = tokenRecord({
				userId,
				kind: 'signInCode',
				spentAt: spentBefore,
			});
			const otherKind = tokenRecord({ userId, kind: 'resetPassword' });
			const otherUser = tokenRecord({ kind: 'signInCode' });
			for (const record of [first, second, spent, otherKind, otherUser]) {
				await stores.tokens.insertToken(record);
			}
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.tokens.spendUserTokens(userId, 'signInCode', now),
				2,
				'spendUserTokens: how many it spent — the two unspent signInCode tokens, not the one already spent',
			);
			for (const record of [first, second]) {
				equal(
					await stores.tokens.consumeToken(record.tokenHash, 'signInCode', now),
					{ ...record, spentAt: now },
					'spendUserTokens should have spent it at `at`, keeping its attempts',
				);
			}
			equal(
				await stores.tokens.consumeToken(spent.tokenHash, 'signInCode', now),
				spent,
				'spendUserTokens should keep the spentAt of a token already spent',
			);
			equal(
				await stores.tokens.consumeToken(
					otherKind.tokenHash,
					'resetPassword',
					now,
				),
				otherKind,
				'spendUserTokens should not touch a token of another kind',
			);
			equal(
				await stores.tokens.consumeToken(
					otherUser.tokenHash,
					'signInCode',
					now,
				),
				otherUser,
				'spendUserTokens should not touch another user',
			);
			equal(
				await stores.tokens.spendUserTokens(userId, 'signInCode', now),
				0,
				'spendUserTokens for a user with none left unspent answers 0, not a failure',
			);
			equal(
				await stores.tokens.spendUserTokens(mintId(), 'signInCode', now),
				0,
				'spendUserTokens for a user with no token at all answers 0',
			);
		},
	},
	{
		id: 'tokens.spendUserTokensExcept',
		group,
		name: 'spares the token named by except, and spends the rest',
		async run({ stores }) {
			const userId = mintId();
			const kept = tokenRecord({ userId, kind: 'signInCode' });
			const others = [
				tokenRecord({ userId, kind: 'signInCode' }),
				tokenRecord({ userId, kind: 'signInCode' }),
			];
			for (const record of [kept, ...others]) {
				await stores.tokens.insertToken(record);
			}
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.tokens.spendUserTokens(
					userId,
					'signInCode',
					now,
					kept.tokenHash,
				),
				2,
				'spendUserTokens with except: how many it spent — every token but the one named',
			);
			equal(
				await stores.tokens.consumeToken(kept.tokenHash, 'signInCode', now),
				kept,
				'spendUserTokens should not spend the token named by except',
			);
			for (const record of others) {
				equal(
					(
						await stores.tokens.consumeToken(
							record.tokenHash,
							'signInCode',
							now,
						)
					)?.spentAt,
					now,
					'spendUserTokens with except should spend every other token',
				);
			}
		},
	},
	{
		id: 'tokens.spendUserTokensRace',
		group,
		name: "spends a token once, when spending a user's tokens races a redemption",
		async run({ stores }) {
			const now = at('2026-02-01T00:00:00.000Z');
			for (let round = 0; round < 10; round += 1) {
				const record = tokenRecord({ kind: 'signInCode' });
				await stores.tokens.insertToken(record);

				const [counted, redeemed] = await Promise.all([
					stores.tokens.spendUserTokens(record.userId, 'signInCode', now),
					stores.tokens.consumeToken(record.tokenHash, 'signInCode', now),
				]);

				equal(
					counted + (redeemed?.spentAt === null ? 1 : 0),
					1,
					'spendUserTokens and consumeToken: exactly one of the two should have spent the token',
				);
			}
		},
	},
];
