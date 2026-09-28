import type { TokenKind } from '../../../auth/port/types';
import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * Every kind the port names. A store that lists them — a column's `CHECK`, a
 * schema's enum — refuses a kind it was not told of, and this is where that
 * shows.
 */
const KINDS = [
	'verifyEmail',
	'resetPassword',
	'secondFactor',
	'signInCode',
	'stepUp',
] as const satisfies readonly TokenKind[];

/** Each kind stored and redeemed as itself, and the two codes kept apart. */
export const tokenKindCases: readonly ConformanceCase[] = [
	{
		id: 'tokens.everyKind',
		group,
		name: 'stores, counts and spends a token of every kind the port names',
		async run({ stores }) {
			const now = at('2026-02-01T00:00:00.000Z');
			for (const kind of KINDS) {
				const record = tokenRecord({ kind, codeHash: 'c'.repeat(64) });
				await stores.tokens.insertToken(record);

				equal(
					await stores.tokens.countAttempt(record.tokenHash, kind),
					{ ...record, attempts: 1 },
					`countAttempt on a ${kind} token should answer it with one attempt`,
				);
				equal(
					await stores.tokens.consumeToken(record.tokenHash, kind, now),
					{ ...record, attempts: 1 },
					`consumeToken on a ${kind} token should answer it as it was — spentAt null`,
				);
			}
		},
	},
	{
		id: 'tokens.stepUpKind',
		group,
		name: 'keeps a step-up apart from a sign-in code: neither is counted, spent nor answered as the other',
		async run({ stores }) {
			const userId = mintId();
			const stepUp = tokenRecord({ userId, kind: 'stepUp' });
			const signInCode = tokenRecord({ userId, kind: 'signInCode' });
			await stores.tokens.insertToken(stepUp);
			await stores.tokens.insertToken(signInCode);
			const now = at('2026-02-01T00:00:00.000Z');

			isNull(
				await stores.tokens.countAttempt(stepUp.tokenHash, 'signInCode'),
				'countAttempt for a stepUp token counted as signInCode',
			);
			isNull(
				await stores.tokens.consumeToken(signInCode.tokenHash, 'stepUp', now),
				'consumeToken for a signInCode token redeemed as stepUp',
			);
			equal(
				await stores.tokens.spendUserTokens(userId, 'stepUp', now),
				1,
				'spendUserTokens of stepUp: the step-up only',
			);
			equal(
				await stores.tokens.consumeToken(
					signInCode.tokenHash,
					'signInCode',
					now,
				),
				signInCode,
				'spendUserTokens of stepUp should not touch a sign-in code, nor anything else have counted it',
			);
		},
	},
];
