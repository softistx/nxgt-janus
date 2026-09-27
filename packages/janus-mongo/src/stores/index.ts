import type { JanusStores } from '@nxgt/janus';
import {
	type SyncOptions,
	type SyncReport,
	syncCollections,
} from '@nxgt/mongo';
import type { Db } from 'mongodb';
import { janusCollections } from '../collections';
import { sessionStore } from './sessions';
import { tokenStore } from './tokens';
import { userStore } from './users';

/**
 * The three stores `janus()` takes, over one MongoDB database.
 *
 * ```ts
 * const db = (await connectMongo(process.env.MONGO_URI)).db;
 * await syncMongoStores(db); // a deployment step: creates the indexes
 * const auth = janus({ user, password: { login: 'email' }, store: createMongoStores(db), hasher });
 * ```
 *
 * **Reads go through `@nxgt/mongo`'s `find*`, never its `get*`.** `findById`
 * answers `undefined` for an absence, so an absence arrives as a *value*,
 * turned into `null` here, and everything that arrives as a rejection is a
 * failure. There is no path on which an absence and an outage travel the same
 * channel, so there is none on which a `catch` could confuse them.
 *
 * **Every conditional write is one driver call** on `raw`, the driver's own
 * collection: `@nxgt/mongo` names no update conditioned on anything but its
 * own lock, and the port needs `version`, `revokedAt` and `kind`.
 *
 * `sessions.deleteExpiredSessions` is not implemented: a TTL index drops lapsed
 * sessions, so `sessions.collectExpired()` answers `UNSUPPORTED` — which is
 * what the port asks of a store with its own expiry.
 */
export function createMongoStores(db: Db): JanusStores {
	return {
		users: userStore(db),
		sessions: sessionStore(db),
		tokens: tokenStore(db),
	};
}

/**
 * Creates the three collections, their validators and their indexes, and says
 * what it changed. Run it twice and the second run sends nothing.
 *
 * A deployment step, never a request-time one: it needs the `dbAdmin` role,
 * and the core never calls it (rule 6). An application that deploys with
 * `@nxgt/mongo`'s `syncAll(db)` already syncs these three with its own.
 */
export function syncMongoStores(
	db: Db,
	options?: SyncOptions,
): Promise<SyncReport[]> {
	return syncCollections(db, janusCollections, options);
}
