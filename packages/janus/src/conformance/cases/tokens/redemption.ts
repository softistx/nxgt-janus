import { equal, isNull } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * How a token is redeemed: once, by one conditional write, and only as its own
 * kind.
 */
export const tokenRedemptionCases: readonly ConformanceCase[] = [
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
];
