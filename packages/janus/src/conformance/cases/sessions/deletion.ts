import { mintId } from '../../../ids/id';
import { equal, isNull, ok } from '../../assert';
import { at, sessionRecord } from '../../fixtures';
import type { ConformanceCase } from '../../types';

const group = 'sessions';

/** What a deletion of sessions removes — a user’s, or the lapsed ones — and what it leaves. */
export const sessionDeletionCases: readonly ConformanceCase[] = [
	{
		id: 'sessions.deleteUser',
		group,
		name: 'deletes every session of one user — standing, revoked or lapsed — and counts them',
		async run({ stores }) {
			const userId = mintId();
			const lapsed = sessionRecord({
				userId,
				expiresAt: at('2026-01-02T00:00:00.000Z'),
			});
			const records = [
				sessionRecord({ userId }),
				sessionRecord({ userId, revokedAt: at('2026-01-02T00:00:00.000Z') }),
				lapsed,
			];
			const stranger = sessionRecord();
			for (const record of [...records, stranger]) {
				await stores.sessions.insertSession(record);
			}

			// The lapsed one may be gone already: a store with its own expiry —
			// a Redis key TTL — drops it as soon as it lapses, which the port
			// allows. Whether it is still there is what the store answers for it.
			const lapsedHeld =
				(await stores.sessions.findSessionByTokenHash(lapsed.tokenHash)) !==
				null;
			const expected = lapsedHeld ? 3 : 2;
			const deleted = await stores.sessions.deleteUserSessions(userId);
			ok(
				deleted === expected,
				`deleteUserSessions: how many it deleted, revoked and lapsed ones included — ${String(expected)}, as the lapsed one is ${lapsedHeld ? 'still held' : 'already expired'}; got ${String(deleted)}`,
			);
			for (const record of records) {
				isNull(
					await stores.sessions.findSessionByTokenHash(record.tokenHash),
					'findSessionByTokenHash after deleteUserSessions',
				);
			}
			equal(
				await stores.sessions.findSessionByTokenHash(stranger.tokenHash),
				stranger,
				'deleteUserSessions should not touch another user',
			);
			equal(
				await stores.sessions.deleteUserSessions(userId),
				0,
				'deleteUserSessions for a user with none answers 0, not a failure',
			);
		},
	},
	{
		id: 'sessions.deleteExpired',
		group,
		name: 'deletes sessions whose expiry is at or before the instant, and only those',
		needs: 'deleteExpiredSessions',
		async run({ stores }) {
			const collect = stores.sessions.deleteExpiredSessions;
			ok(collect !== undefined, 'deleteExpiredSessions should be present');
			const lapsed = sessionRecord({
				expiresAt: at('2026-01-10T00:00:00.000Z'),
			});
			const living = sessionRecord({
				expiresAt: at('2026-01-10T00:00:00.001Z'),
			});
			await stores.sessions.insertSession(lapsed);
			await stores.sessions.insertSession(living);

			equal(
				await collect?.call(stores.sessions, at('2026-01-10T00:00:00.000Z')),
				1,
				'deleteExpiredSessions: how many it deleted',
			);
			isNull(
				await stores.sessions.findSessionByTokenHash(lapsed.tokenHash),
				'findSessionByTokenHash after deleteExpiredSessions',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(living.tokenHash),
				living,
				'deleteExpiredSessions should keep a session one millisecond short of lapsing',
			);
		},
	},
];
