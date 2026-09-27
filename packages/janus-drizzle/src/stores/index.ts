import type { PgDatabase } from '@nxgt/drizzle/pg';
import type { JanusStores } from '@nxgt/janus';
import { type DrizzleAdapterOptions, defineJanusTables } from '../tables';
import type { IdentityTable } from './identity-tables';
import { sessionStore } from './sessions';
import { tokenStore } from './tokens';
import { userStore } from './users';

/**
 * The three stores `janus()` takes, over one PostgreSQL database through
 * Drizzle.
 *
 * ```ts
 * const db = drizzle(process.env.DATABASE_URL);
 * const auth = janus({ user, password: { login: 'email' }, store: createDrizzleStores(db), hasher });
 * ```
 *
 * **Every read is one statement**, whose absence is an empty result, turned
 * into `null` here; everything that arrives as a rejection is a failure. There
 * is no path on which an absence and an outage travel the same channel.
 *
 * **A user is written in one transaction** with its logins, whose table holds
 * their uniqueness — `@nxgt/drizzle`'s `withTransaction`, inside the method,
 * as rule 5 allows. Every other write is one statement.
 *
 * `sessions.deleteExpiredSessions` is implemented: PostgreSQL has no TTL, so
 * `auth.collectExpired()` is how lapsed sessions leave the table.
 *
 * `{ tables }` is what your schema file exports; absent, the tables in the
 * connection's `search_path`.
 */
export function createDrizzleStores(
	db: PgDatabase,
	options: DrizzleAdapterOptions<IdentityTable> = {},
): JanusStores {
	const tables = options.tables ?? defineJanusTables();
	return {
		users: userStore(db, tables),
		sessions: sessionStore(db, tables),
		tokens: tokenStore(db, tables),
	};
}
