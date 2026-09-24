import { mintIdentityId } from '../../ids/identity-id';
import { equal, isNull, ok } from '../assert';
import { at, sessionRecord } from '../fixtures';
import type { ConformanceCase } from '../types';

const group = 'sessions';

export const sessionStoreCases: readonly ConformanceCase[] = [
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
	{
		id: 'sessions.idempotentInsert',
		group,
		name: 'is idempotent under retry: inserting an existing session id writes nothing',
		async run({ stores }) {
			const record = sessionRecord();
			await stores.sessions.insertSession(record);
			await stores.sessions.insertSession({ ...record, aal: 'aal2' });

			equal(
				await stores.sessions.findSessionByTokenHash(record.tokenHash),
				record,
				'insertSession retried with the same id should write nothing',
			);
		},
	},
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
				await stores.sessions.extendSession(mintIdentityId(), later),
				'extendSession on an unknown session',
			);
		},
	},
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
				await stores.sessions.revokeSession(mintIdentityId(), first),
				false,
				'revokeSession on an unknown session',
			);
		},
	},
	{
		id: 'sessions.revokeIdentity',
		group,
		name: 'revokes every standing session of one identity but the one excepted, and counts only what it revoked',
		async run({ stores }) {
			const identityId = mintIdentityId();
			const current = sessionRecord({ identityId });
			const other = sessionRecord({ identityId });
			const already = sessionRecord({
				identityId,
				revokedAt: at('2026-01-02T00:00:00.000Z'),
			});
			const stranger = sessionRecord();
			for (const record of [current, other, already, stranger]) {
				await stores.sessions.insertSession(record);
			}
			const now = at('2026-02-01T00:00:00.000Z');

			equal(
				await stores.sessions.revokeIdentitySessions(
					identityId,
					now,
					current.id,
				),
				1,
				'revokeIdentitySessions with except: how many this call revoked',
			);
			isNull(
				(await stores.sessions.findSessionByTokenHash(current.tokenHash))
					?.revokedAt ?? null,
				'revokeIdentitySessions should spare the excepted session',
			);
			equal(
				(await stores.sessions.findSessionByTokenHash(already.tokenHash))
					?.revokedAt,
				already.revokedAt,
				'revokeIdentitySessions should keep an earlier revokedAt',
			);
			equal(
				await stores.sessions.findSessionByTokenHash(stranger.tokenHash),
				stranger,
				'revokeIdentitySessions should not touch another identity',
			);
			equal(
				await stores.sessions.revokeIdentitySessions(identityId, now),
				1,
				'revokeIdentitySessions without except',
			);
			equal(
				await stores.sessions.revokeIdentitySessions(mintIdentityId(), now),
				0,
				'revokeIdentitySessions for an identity with none answers 0, not a failure',
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
