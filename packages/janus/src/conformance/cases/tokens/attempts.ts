import { equal, isNull } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * How an attempt at a code is counted: once per call, never on a spent token,
 * and never lost to a race with the redemption.
 */
export const tokenAttemptCases: readonly ConformanceCase[] = [
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
];
