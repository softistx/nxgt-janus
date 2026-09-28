import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { SessionRecord, SessionStore } from '@nxgt/janus';
import { and, eq, isNull, lte, ne, sql } from 'drizzle-orm';
import { run } from '../translate';
import type { IdentityTables } from './identity-tables';
import { stamp, toSession } from './records';

export function sessionStore(
	db: PgDatabase,
	tables: IdentityTables,
): SessionStore {
	const run$ = <T>(operation: string, body: () => Promise<T>) =>
		run('sessions', operation, body);

	return {
		insertSession: (record) =>
			run$('insertSession', async () => {
				// Idempotent under retry: a session with this id is already there.
				// A collision on the token hash is not a retry, and fails.
				await db
					.insert(tables.sessions)
					.values(record)
					.onConflictDoNothing({ target: tables.sessions.id });
			}),

		findSessionByTokenHash: (tokenHash) =>
			run$('findSessionByTokenHash', async () => {
				const [row] = await db
					.select()
					.from(tables.sessions)
					.where(eq(tables.sessions.tokenHash, tokenHash));
				return row === undefined ? null : toSession(row);
			}),

		extendSession: (id, expiresAt) =>
			run$('extendSession', async () => {
				// `revoked_at is null` in the condition: an extension racing a
				// revocation matches nothing, and never brings the session back.
				const [row] = await db
					.update(tables.sessions)
					.set({ expiresAt })
					.where(
						and(eq(tables.sessions.id, id), isNull(tables.sessions.revokedAt)),
					)
					.returning();
				return row === undefined ? null : toSession(row);
			}),

		reauthenticateSession: (id, at) =>
			run$('reauthenticateSession', () =>
				reauthenticateSession(db, tables, id, at),
			),

		revokeSession: (id, at) =>
			run$('revokeSession', () => revokeSession(db, tables, id, at)),

		revokeUserSessions: (userId, at, except) =>
			run$('revokeUserSessions', () =>
				revokeUserSessions(db, tables, userId, at, except),
			),

		deleteUserSessions: (userId) =>
			run$('deleteUserSessions', async () => {
				const deleted = await db
					.delete(tables.sessions)
					.where(eq(tables.sessions.userId, userId))
					.returning({ id: tables.sessions.id });
				return deleted.length;
			}),

		deleteExpiredSessions: (before) =>
			run$('deleteExpiredSessions', async () => {
				const deleted = await db
					.delete(tables.sessions)
					.where(lte(tables.sessions.expiresAt, before))
					.returning({ id: tables.sessions.id });
				return deleted.length;
			}),
	};
}

async function reauthenticateSession(
	db: PgDatabase,
	tables: IdentityTables,
	id: string,
	at: Date,
): Promise<SessionRecord | null> {
	// The same condition as an extension's: a confirmation racing a
	// revocation matches nothing.
	const [row] = await db
		.update(tables.sessions)
		.set({ authenticatedAt: at })
		.where(and(eq(tables.sessions.id, id), isNull(tables.sessions.revokedAt)))
		.returning();
	return row === undefined ? null : toSession(row);
}

async function revokeSession(
	db: PgDatabase,
	tables: IdentityTables,
	id: string,
	at: Date,
): Promise<boolean> {
	// `coalesce`, so a session already revoked keeps its first
	// `revokedAt` and still counts as matched.
	const matched = await db
		.update(tables.sessions)
		.set({
			revokedAt: sql`coalesce(${tables.sessions.revokedAt}, ${stamp(at)})`,
		})
		.where(eq(tables.sessions.id, id))
		.returning({ id: tables.sessions.id });
	return matched.length === 1;
}

async function revokeUserSessions(
	db: PgDatabase,
	tables: IdentityTables,
	userId: string,
	at: Date,
	except: string | undefined,
): Promise<number> {
	const standing = and(
		eq(tables.sessions.userId, userId),
		isNull(tables.sessions.revokedAt),
	);
	const revoked = await db
		.update(tables.sessions)
		.set({ revokedAt: at })
		.where(
			except === undefined
				? standing
				: and(standing, ne(tables.sessions.id, except)),
		)
		.returning({ id: tables.sessions.id });
	return revoked.length;
}
