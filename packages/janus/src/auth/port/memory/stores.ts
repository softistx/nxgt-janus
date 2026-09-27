import type { JanusStores } from '../types';
import { memorySessionStore } from './sessions';
import { memoryTokenStore } from './tokens';
import { memoryUserStore } from './users';

/**
 * The reference implementation of the store port, in memory.
 *
 * **Shipped and documented, not a test helper.** It is what a consumer uses in
 * their own unit tests, and what an adapter author compares against when a
 * conformance case they do not understand turns red. So it keeps the six rules
 * for real rather than approximately:
 *
 * - uniqueness is a constraint — an index checked and written inside the same
 *   synchronous step, which is what atomic means on one event loop;
 * - `consumeToken` reads and writes with no `await` between the two, so twenty
 *   concurrent calls see exactly one unspent token;
 * - every record is **copied in and copied out**, so a caller that mutates what
 *   it passed or what it got back cannot reach the store — the in-memory
 *   version of "bytes round-trip";
 * - a patch applies only the fields it names, and only the fields the port
 *   declares: a stray `version` or `id` in a patch from JavaScript is ignored,
 *   not written.
 *
 * Every method is `async` even though none waits on anything: a caller that
 * forgot an `await` must fail here the way it would against a real database.
 */
export function createMemoryStores(): JanusStores {
	return {
		users: memoryUserStore(),
		sessions: memorySessionStore(),
		tokens: memoryTokenStore(),
	};
}
