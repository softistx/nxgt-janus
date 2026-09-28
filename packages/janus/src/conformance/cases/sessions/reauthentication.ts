import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What a step-up moves on a session, and the revoked session it never brings back. */
export const sessionReauthenticationCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.reauthenticate',
		group,
		name: 'moves authenticatedAt on a standing session, and never brings back a revoked one',
		async run({ stores }) {
			const standing = sessionRecord();
			const revoked = sessionRecord({
				revokedAt: at('2026-01-02T00:00:00.000Z'),
			});
			await stores.sessions.insertSession(standing);
			await stores.sessions.insertSession(revoked);
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.sessions.reauthenticateSession(standing.id, now),
				{ ...standing, authenticatedAt: now },
				'reauthenticateSession should answer the session with its new authenticatedAt, and every other field as it was',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(standing.tokenHash),
				{ ...standing, authenticatedAt: now },
				'reauthenticateSession should have written authenticatedAt, and read back the same',
			);
			isNull(
				await stores.sessions.reauthenticateSession(revoked.id, now),
				'reauthenticateSession on a revoked session — a confirmation racing a revocation must never bring it back',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(revoked.tokenHash),
				revoked,
				'reauthenticateSession refused on a revoked session should have written nothing',
			);
			isNull(
				await stores.sessions.reauthenticateSession(mintId(), now),
				'reauthenticateSession on an unknown session',
			);
		},
	},
	{
		id: 'sessions.reauthenticateRace',
		group,
		name: 'never brings back a session whose revocation races its confirmation',
		async run({ stores }) {
			const now = at('2026-02-01T00:00:00.000Z');
			for (let round = 0; round < 10; round += 1) {
				const record = sessionRecord();
				await stores.sessions.insertSession(record);

				await Promise.all([
					stores.sessions.reauthenticateSession(record.id, now),
					stores.sessions.revokeSession(record.id, now),
				]);

				equal(
					(await stores.sessions.findSessionByTokenHash(record.tokenHash))
						?.revokedAt,
					now,
					'reauthenticateSession racing revokeSession: the session should stay revoked — one conditional write, never a read then a write',
				);
			}
		},
	},
];
