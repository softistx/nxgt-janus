import { describe, expect, it } from 'bun:test';
import { mintId } from '../../../ids/id';
import { createMemoryStores } from './stores';
import { at, session } from './stores.fixtures';

// These specs pin the reference store's own behaviour. The conformance suite,
// in `src/conformance/`, is what asks the same questions of every adapter; these
// stay because the store is shipped, and a consumer's tests rely on it.

describe('sessions', () => {
	it('answers a lapsed or revoked session verbatim: expiry is the core’s decision', async () => {
		const { sessions } = createMemoryStores();
		const record = session({ expiresAt: at(5), revokedAt: at(4) });
		await sessions.insertSession(record);

		expect(await sessions.findSessionByTokenHash(record.tokenHash)).toEqual(
			record,
		);
		expect(await sessions.findSessionByTokenHash('unknown')).toBeNull();
	});

	it('extends a standing session, and never brings a revoked one back', async () => {
		const { sessions } = createMemoryStores();
		const standing = session();
		const revoked = session({ revokedAt: at(2) });
		await sessions.insertSession(standing);
		await sessions.insertSession(revoked);

		expect(
			(await sessions.extendSession(standing.id, at(2000)))?.expiresAt,
		).toEqual(at(2000));
		expect(await sessions.extendSession(revoked.id, at(2000))).toBeNull();
		expect(await sessions.extendSession(mintId(), at(2000))).toBeNull();
	});

	it('moves authenticatedAt on a standing session, and never on a revoked one', async () => {
		const { sessions } = createMemoryStores();
		const standing = session();
		const revoked = session({ revokedAt: at(2) });
		await sessions.insertSession(standing);
		await sessions.insertSession(revoked);

		expect(await sessions.reauthenticateSession(standing.id, at(900))).toEqual({
			...standing,
			authenticatedAt: at(900),
		});
		expect(
			await sessions.reauthenticateSession(revoked.id, at(900)),
		).toBeNull();
		expect(await sessions.reauthenticateSession(mintId(), at(900))).toBeNull();
	});

	it('revokes once, keeps the first revokedAt, and says false only for no session', async () => {
		const { sessions } = createMemoryStores();
		const record = session();
		await sessions.insertSession(record);

		expect(await sessions.revokeSession(record.id, at(2))).toBe(true);
		expect(await sessions.revokeSession(record.id, at(3))).toBe(true);
		expect(
			(await sessions.findSessionByTokenHash(record.tokenHash))?.revokedAt,
		).toEqual(at(2));
		expect(await sessions.revokeSession(mintId(), at(3))).toBe(false);
	});

	it('signs out everywhere else, and counts only what this call revoked', async () => {
		const { sessions } = createMemoryStores();
		const userId = mintId();
		const current = session({ userId });
		const other = session({ userId });
		const already = session({ userId, revokedAt: at(1) });
		const stranger = session();
		for (const record of [current, other, already, stranger]) {
			await sessions.insertSession(record);
		}

		expect(await sessions.revokeUserSessions(userId, at(2), current.id)).toBe(
			1,
		);
		expect(
			(await sessions.findSessionByTokenHash(current.tokenHash))?.revokedAt,
		).toBeNull();
		expect(
			(await sessions.findSessionByTokenHash(stranger.tokenHash))?.revokedAt,
		).toBeNull();
		expect(await sessions.revokeUserSessions(userId, at(3))).toBe(1);
	});

	it('collects sessions at or before the instant, and only those', async () => {
		const { sessions } = createMemoryStores();
		const lapsed = session({ expiresAt: at(10) });
		const living = session({ expiresAt: at(11) });
		await sessions.insertSession(lapsed);
		await sessions.insertSession(living);

		expect(await sessions.deleteExpiredSessions?.(at(10))).toBe(1);
		expect(await sessions.findSessionByTokenHash(lapsed.tokenHash)).toBeNull();
		expect(await sessions.findSessionByTokenHash(living.tokenHash)).toEqual(
			living,
		);
	});
});
