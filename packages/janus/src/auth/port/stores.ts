/**
 * The three stores together: what `janus()` takes, and what `assertStores`
 * reports about them.
 *
 * Part of the store port; the rules every implementation keeps are in
 * `./types`.
 */

import type { SessionStore } from './sessions';
import type { TokenStore } from './tokens';
import type { UserStore } from './users';

/**
 * The three stores `janus()` takes.
 *
 * Each slot may come from a different adapter. That is the point of the seam:
 * `@nxgt/janus-redis` can serve `sessions` and `tokens` while
 * `@nxgt/janus-mongo` serves `users`.
 */
export interface JanusStores {
	readonly users: UserStore;
	readonly sessions: SessionStore;
	readonly tokens: TokenStore;
}

/** What `assertStores` found beyond the required methods. */
export interface StoreCapabilities {
	/** Whether `sessions.deleteExpiredSessions` is implemented. */
	readonly collectExpired: boolean;
}
