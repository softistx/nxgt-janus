import { index, unique } from 'drizzle-orm/pg-core';
import { at, key, type TableOf } from './columns';

/**
 * Sessions. No foreign key to the user: deleting a user deletes the user,
 * and the core deletes the sessions next — as it does when they live
 * elsewhere, in Redis.
 */
export function sessionsTable(table: TableOf) {
	return table(
		'sessions',
		{
			id: key('id').primaryKey(),
			/** `sha256` of the session token. The secret itself is never stored. */
			tokenHash: key('token_hash').notNull(),
			userId: key('user_id').notNull(),
			authenticatedAt: at('authenticated_at').notNull(),
			expiresAt: at('expires_at').notNull(),
			revokedAt: at('revoked_at'),
			createdAt: at('created_at').notNull(),
		},
		(t) => [
			unique('sessions_token_hash_unique').on(t.tokenHash),
			index('sessions_user_id').on(t.userId),
			/** `deleteExpiredSessions`: PostgreSQL has no TTL, so the core collects. */
			index('sessions_expires_at').on(t.expiresAt),
		],
	);
}
