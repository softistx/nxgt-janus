import { equal } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * What a store keeps of an inserted token: an empty address, an expiry it
 * leaves to the core, and the first write under a retry.
 */
export const tokenInsertCases: readonly ConformanceCase[] = [
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
];
