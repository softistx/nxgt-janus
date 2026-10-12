import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, tokenRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'tokens';

/**
 * A change of e-mail's token kept apart from a verification's: the two can
 * sit in the store for one user and one address, and neither is counted,
 * spent or answered as the other.
 */
export const tokenChangeEmailCases: readonly ConformanceCase[] = [
	{
		id: 'tokens.changeEmailKind',
		group,
		name: 'keeps an e-mail change apart from a verification, and keeps the address it replaces in codeHash',
		async run({ stores }) {
			const userId = mintId();
			const address = 'new@example.test';
			const change = tokenRecord({
				userId,
				address,
				kind: 'changeEmail',
				codeHash: 'f'.repeat(64),
			});
			const verification = tokenRecord({
				userId,
				address,
				kind: 'verifyEmail',
			});
			await stores.tokens.insertToken(change);
			await stores.tokens.insertToken(verification);
			const now = at('2026-02-01T00:00:00.000Z');

			// A verification link proves the address the user holds; redeemed as a
			// change it would move the user to whatever address its token names.
			isNull(
				await stores.tokens.consumeToken(
					verification.tokenHash,
					'changeEmail',
					now,
				),
				'consumeToken for a verifyEmail token redeemed as changeEmail',
			);
			isNull(
				await stores.tokens.consumeToken(change.tokenHash, 'verifyEmail', now),
				'consumeToken for a changeEmail token redeemed as verifyEmail',
			);
			isNull(
				await stores.tokens.countAttempt(change.tokenHash, 'verifyEmail'),
				'countAttempt for a changeEmail token counted as verifyEmail',
			);
			equal(
				await stores.tokens.spendUserTokens(userId, 'changeEmail', now),
				1,
				'spendUserTokens of changeEmail: the change only',
			);
			equal(
				await stores.tokens.consumeToken(
					verification.tokenHash,
					'verifyEmail',
					now,
				),
				verification,
				'spendUserTokens of changeEmail should not touch a verification, nor anything else have counted it',
			);
		},
	},
];
