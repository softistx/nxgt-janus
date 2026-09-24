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
				await stores.tokens.consumeToken(record.tokenHash, 'recovery', first),
				record,
				'consumeToken the first time should answer the token as it was — spentAt null',
			);
			equal(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'recovery',
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
					stores.tokens.consumeToken(record.tokenHash, 'recovery', now),
				),
			);

			equal(
				answers.filter((answer) => answer !== null && answer.spentAt === null)
					.length,
				1,
				'consumeToken: of twenty concurrent calls, exactly one should see spentAt null — a recovery code redeemed twice is an account takeover',
			);
		},
	},
	{
		id: 'tokens.kind',
		group,
		name: 'does not know, and does not spend, a token of the other kind',
		async run({ stores }) {
			const record = tokenRecord({ kind: 'verification' });
			await stores.tokens.insertToken(record);

			isNull(
				await stores.tokens.consumeToken(
					record.tokenHash,
					'recovery',
					at('2026-02-01T00:00:00.000Z'),
				),
				'consumeToken for a verification token redeemed as recovery',
			);
			const own = await stores.tokens.consumeToken(
				record.tokenHash,
				'verification',
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
					'recovery',
					at('2026-02-01T00:00:00.000Z'),
				),
				'consumeToken for an unknown hash',
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
				'recovery',
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
					(await stores.tokens.consumeToken(record.tokenHash, 'recovery', now))
						?.spentAt,
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
					'recovery',
					at('2026-02-01T00:00:00.000Z'),
				),
				record,
				'insertToken retried with the same hash should write nothing',
			);
		},
	},
];
