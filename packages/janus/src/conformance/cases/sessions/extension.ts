import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What an extension moves, and the revoked session it never brings back. */
export const sessionExtensionCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.extend',
		group,
		name: 'extends a standing session, and never brings back a revoked one',
		async run({ stores }) {
			const standing = sessionRecord();
			const revoked = sessionRecord({
				revokedAt: at('2026-01-02T00:00:00.000Z'),
			});
			await stores.sessions.insertSession(standing);
			await stores.sessions.insertSession(revoked);
			const later = at('2099-06-01T00:00:00.000Z');

			equal(
				await stores.sessions.extendSession(standing.id, later),
				{ ...standing, expiresAt: later },
				'extendSession should answer the session with its new expiresAt',
			);
			isNull(
				await stores.sessions.extendSession(revoked.id, later),
				'extendSession on a revoked session — an extension racing a revocation must never bring it back',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(revoked.tokenHash),
				revoked,
				'extendSession refused on a revoked session should have written nothing',
			);
			isNull(
				await stores.sessions.extendSession(mintId(), later),
				'extendSession on an unknown session',
			);
		},
	},
];
