import { mintId } from '../../ids/id';
import { equal, isNull } from '../assert';
import { at, tokenRecord } from '../fixtures';
import type { ConformanceCase } from '../types';

const group = 'tokens';

export const tokenStoreCases: readonly ConformanceCase[] = [
	{
		id: 'tokens.consume',
		group,
		name: 'answers the token as it was before the call: spentAt null means this call spent it',
		async run({ stores }) {
			const record = tokenRecord();
			await stores.tokens.insertToken(record);
			const first = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'resetPassword',
					first,
				),
				record,
				'consumeToken the first time should answer the token as it was — spentAt null',
			);
			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'resetPassword',
					at('2026-02-02T00:00:00.000Z'),
				),
				{ ...record, spentAt: first },
				'consumeToken the second time should answer it spent at the first call’s instant, and change nothing',
			);
		},
	},
	{
		id: 'tokens.concurrency',
		group,
		name: 'lets exactly one of twenty concurrent redemptions spend a token — one conditional write, never a read then a write',
		async run({ stores }) {
			const record = tokenRecord();
			await stores.tokens.insertToken(record);
			const now = at('2026-02-01T00:00:00.000Z');

			const answers = await Promise.all(
				Array.from({ length: 20 }, () =>
					stores.tokens.consumeToken(record.tokenHash, 'resetPassword', now),
				),
			);

			equal(
				answers.filter((answer) => answer !== null && answer.spentAt === null)
					.length,
				1,
				'consumeToken: of twenty concurrent calls, exactly one should see spentAt null — a reset token redeemed twice is an account takeover',
			);
		},
	},
	{
		id: 'tokens.kind',
		group,
		name: 'does not know, and does not spend, a token of the other kind',
		async run({ stores }) {
			const record = tokenRecord({ kind: 'verifyEmail' });
			await stores.tokens.insertToken(record);

			isNull(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'resetPassword',
					at('2026-02-01T00:00:00.000Z'),
				),
				'consumeToken for a verifyEmail token redeemed as resetPassword',
			);
			const own = await stores.tokens.consumeToken(
				record.tokenHash,
				'verifyEmail',
				at('2026-02-02T00:00:00.000Z'),
			);
			equal(
				own,
				record,
				'consumeToken of the other kind should not have spent the token: redeemed as its own kind, it is still unspent',
			);
			isNull(
				await stores.tokens.consumeToken(
					'0'.repeat(64),
					'resetPassword',
					at('2026-02-01T00:00:00.000Z'),
				),
				'consumeToken for an unknown hash',
			);
		},
	},
	{
		id: 'tokens.countAttempt',
		group,
		name: 'counts an attempt at a code, and answers the token as it is after the call',
		async run({ stores }) {
			const record = tokenRecord({
				kind: 'signInCode',
				codeHash: 'c'.repeat(64),
			});
			await stores.tokens.insertToken(record);

			equal(
				await stores.tokens.countAttempt(record.tokenHash, 'signInCode'),
				{ ...record, attempts: 1 },
				'countAttempt the first time should answer the token with attempts 1, codeHash as written',
			);
			equal(
				await stores.tokens.countAttempt(record.tokenHash, 'signInCode'),
				{ ...record, attempts: 2 },
				'countAttempt the second time should answer attempts 2',
			);
			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'signInCode',
					at('2026-02-01T00:00:00.000Z'),
				),
				{ ...record, attempts: 2 },
				'consumeToken should answer the attempts counted, and spend the token',
			);
		},
	},
	{
		id: 'tokens.countAttemptConcurrency',
		group,
		name: 'gives twenty concurrent attempts twenty distinct counts — one conditional write, never a read then a write',
		async run({ stores }) {
			const record = tokenRecord({ kind: 'secondFactor' });
			await stores.tokens.insertToken(record);

			const answers = await Promise.all(
				Array.from({ length: 20 }, () =>
					stores.tokens.countAttempt(record.tokenHash, 'secondFactor'),
				),
			);

			equal(
				answers
					.map((answer) => answer?.attempts)
					.sort((a, b) => (a ?? 0) - (b ?? 0)),
				Array.from({ length: 20 }, (_, index) => index + 1),
				'countAttempt: twenty concurrent calls should answer 1 to 20, each once — two guesses reading one count is a guess for free',
			);
		},
	},
	{
		id: 'tokens.countAttemptRace',
		group,
		name: 'never counts an attempt once the token is spent, when attempts and a redemption race',
		async run({ stores }) {
			const record = tokenRecord({ kind: 'signInCode' });
			await stores.tokens.insertToken(record);
			const now = at('2026-02-01T00:00:00.000Z');
			const count = () =>
				stores.tokens.countAttempt(record.tokenHash, 'signInCode');

			const answers = await Promise.all([
				...Array.from({ length: 10 }, count),
				stores.tokens.consumeToken(record.tokenHash, 'signInCode', now),
				...Array.from({ length: 10 }, count),
			]);
			const final = await stores.tokens.consumeToken(
				record.tokenHash,
				'signInCode',
				now,
			);
			if (final === null) {
				throw new Error('consumeToken after the race should answer the token');
			}
			const counted = answers
				.slice(0, 10)
				.concat(answers.slice(11))
				.filter((answer) => answer !== null && answer.spentAt === null)
				.map((answer) => answer?.attempts ?? 0)
				.sort((a, b) => a - b);

			equal(
				counted,
				Array.from({ length: final.attempts }, (_, index) => index + 1),
				'countAttempt: the attempts answered unspent should be 1 to the final count, each once',
			);
			equal(
				answers
					.filter((answer) => answer !== null && answer.spentAt !== null)
					.every((answer) => answer?.attempts === final.attempts),
				true,
				'countAttempt: every answer after the spend should carry the final count — an attempt counted on a spent token is one the limit never saw',
			);
		},
	},
	{
		id: 'tokens.countAttemptSpent',
		group,
		name: 'does not count an attempt at a spent token, nor at a token of another kind, nor at none',
		async run({ stores }) {
			const spent = tokenRecord({
				kind: 'signInCode',
				attempts: 3,
				spentAt: at('2026-01-02T00:00:00.000Z'),
			});
			const other = tokenRecord({ kind: 'resetPassword' });
			await stores.tokens.insertToken(spent);
			await stores.tokens.insertToken(other);

			for (const call of ['first', 'second']) {
				equal(
					await stores.tokens.countAttempt(spent.tokenHash, 'signInCode'),
					spent,
					`countAttempt on a spent token, the ${call} time, should answer it as it is: attempts still 3, nothing written`,
				);
			}
			isNull(
				await stores.tokens.countAttempt(other.tokenHash, 'signInCode'),
				'countAttempt for a resetPassword token counted as signInCode',
			);
			equal(
				await stores.tokens.consumeToken(
					other.tokenHash,
					'resetPassword',
					at('2026-02-01T00:00:00.000Z'),
				),
				other,
				'countAttempt of the other kind should not have counted: attempts still 0',
			);
			isNull(
				await stores.tokens.countAttempt('0'.repeat(64), 'signInCode'),
				'countAttempt for an unknown hash',
			);
		},
	},
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
	{
		id: 'tokens.challenge',
		group,
		name: "keeps a second-factor challenge, whose address is '' — nothing was sent for it",
		async run({ stores }) {
			const record = tokenRecord({ kind: 'secondFactor', address: '' });
			await stores.tokens.insertToken(record);

			equal(
				await stores.tokens.countAttempt(record.tokenHash, 'secondFactor'),
				{ ...record, attempts: 1 },
				"countAttempt should answer a challenge with its empty address kept — a store that refuses '' refuses every sign-in with a second factor",
			);
			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'secondFactor',
					at('2026-02-01T00:00:00.000Z'),
				),
				{ ...record, attempts: 1 },
				'consumeToken should spend the challenge and answer it as it was',
			);
		},
	},
	{
		id: 'tokens.lapsed',
		group,
		name: 'spends a lapsed token all the same: expiry is compared by the core, after the call',
		async run({ stores }) {
			const record = tokenRecord({ expiresAt: at('2020-01-01T00:00:00.000Z') });
			await stores.tokens.insertToken(record);
			const now = at('2026-02-01T00:00:00.000Z');

			const first = await stores.tokens.consumeToken(
				record.tokenHash,
				'resetPassword',
				now,
			);
			// A store may have dropped a lapsed token already; if it answers, it
			// answers it unspent, and spends it.
			if (first !== null) {
				equal(
					first,
					record,
					'consumeToken on a lapsed token should answer it as it was',
				);
				equal(
					(
						await stores.tokens.consumeToken(
							record.tokenHash,
							'resetPassword',
							now,
						)
					)?.spentAt,
					now,
					'consumeToken should have spent the lapsed token, so it can never be retried',
				);
			}
		},
	},
	{
		id: 'tokens.idempotentInsert',
		group,
		name: 'is idempotent under retry: inserting an existing token hash writes nothing',
		async run({ stores }) {
			const record = tokenRecord();
			await stores.tokens.insertToken(record);
			await stores.tokens.insertToken({
				...record,
				address: 'other@example.test',
			});

			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'resetPassword',
					at('2026-02-01T00:00:00.000Z'),
				),
				record,
				'insertToken retried with the same hash should write nothing',
			);
		},
	},
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
