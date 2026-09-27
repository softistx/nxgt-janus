import { equal, isNull } from '../../assert';
import { at, sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What a lookup by token hash answers: a stored session verbatim, never a changed one. */
export const sessionReadCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.verbatim',
		group,
		name: 'answers a stored session verbatim — revoked or lapsed — or null once lapsed, and never a changed record',
		async run({ stores }) {
			const standing = sessionRecord();
			const revoked = sessionRecord({
				revokedAt: at('2026-01-02T00:00:00.000Z'),
			});
			const lapsed = sessionRecord({
				expiresAt: at('2020-01-01T00:00:00.000Z'),
			});
			for (const record of [standing, revoked, lapsed]) {
				await stores.sessions.insertSession(record);
			}

			equal(
				await stores.sessions.findSessionByTokenHash(standing.tokenHash),
				standing,
				'findSessionByTokenHash for a standing session',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(revoked.tokenHash),
				revoked,
				'findSessionByTokenHash for a revoked session should answer it verbatim — revocation is the core’s to read',
			);

			// A TTL index may already have dropped it: null is allowed, a changed
			// record is not.
			const found = await stores.sessions.findSessionByTokenHash(
				lapsed.tokenHash,
			);
			if (found !== null) {
				equal(
					found,
					lapsed,
					'findSessionByTokenHash for a lapsed session should answer it verbatim, or null',
				);
			}

			isNull(
				await stores.sessions.findSessionByTokenHash('f'.repeat(64)),
				'findSessionByTokenHash for an unknown hash',
			);
		},
	},
];
