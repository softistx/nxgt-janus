import { mintId } from '../../../ids/id';
import { equal, isNull } from '../../assert';
import { at, sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What a revocation marks — one session, or every one of a user — and what it keeps. */
export const sessionRevocationCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.revoke',
		group,
		name: 'revokes once and keeps the first revokedAt; answers false only when there is no session',
		async run({ stores }) {
			const record = sessionRecord();
			await stores.sessions.insertSession(record);
			const first = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.sessions.revokeSession(record.id, first),
				true,
				'revokeSession on a standing session',
			);
			equal(
				await stores.sessions.revokeSession(
					record.id,
					at('2026-03-01T00:00:00.000Z'),
				),
				true,
				'revokeSession on a revoked session still answers true: the session exists',
			);
			equal(
				(await stores.sessions.findSessionByTokenHash(record.tokenHash))
					?.revokedAt,
				first,
				'revokeSession twice should keep the first revokedAt',
			);
			equal(
				await stores.sessions.revokeSession(mintId(), first),
				false,
				'revokeSession on an unknown session',
			);
		},
	},
	{
		id: 'sessions.revokeUser',
		group,
		name: 'revokes every standing session of one user but the one excepted, and counts only what it revoked',
		async run({ stores }) {
			const userId = mintId();
			const current = sessionRecord({ userId });
			const other = sessionRecord({ userId });
			const already = sessionRecord({
				userId,
				revokedAt: at('2026-01-02T00:00:00.000Z'),
			});
			const stranger = sessionRecord();
			for (const record of [current, other, already, stranger]) {
				await stores.sessions.insertSession(record);
			}
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.sessions.revokeUserSessions(userId, now, current.id),
				1,
				'revokeUserSessions with except: how many this call revoked',
			);
			isNull(
				(await stores.sessions.findSessionByTokenHash(current.tokenHash))
					?.revokedAt ?? null,
				'revokeUserSessions should spare the excepted session',
			);
			equal(
				(await stores.sessions.findSessionByTokenHash(already.tokenHash))
					?.revokedAt,
				already.revokedAt,
				'revokeUserSessions should keep an earlier revokedAt',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(stranger.tokenHash),
				stranger,
				'revokeUserSessions should not touch another user',
			);
			equal(
				await stores.sessions.revokeUserSessions(userId, now),
				1,
				'revokeUserSessions without except',
			);
			equal(
				await stores.sessions.revokeUserSessions(mintId(), now),
				0,
				'revokeUserSessions for a user with none answers 0, not a failure',
			);
		},
	},
];
