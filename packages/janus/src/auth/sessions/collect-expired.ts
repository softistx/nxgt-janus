/**
 * `collectExpired()`: the lapsed sessions and the lapsed one-time tokens, from
 * whichever of the two stores implements its collector.
 */

import { UnsupportedError } from '../../errors/janus-error';
import type { Context } from '../context';

/**
 * Deletes what has lapsed at `clock.now()` and answers how many in all.
 *
 * Sessions first, then tokens, one after the other: both deletions are
 * idempotent, so a token failure after the sessions went leaves a call that can
 * simply be repeated. `UNSUPPORTED` only when neither store has a collector.
 */
export async function collectExpired(context: Context): Promise<number> {
	const { store, clock, capabilities } = context;
	const sessions = capabilities.collectExpired
		? store.sessions.deleteExpiredSessions
		: undefined;
	const tokens = capabilities.collectExpiredTokens
		? store.tokens.deleteExpiredTokens
		: undefined;

	if (sessions === undefined && tokens === undefined) {
		throw new UnsupportedError(
			'collectExpired: store.sessions does not implement deleteExpiredSessions, nor store.tokens deleteExpiredTokens — their stores expire records on their own, or implement the methods',
			{ slot: 'sessions', operation: 'deleteExpiredSessions' },
		);
	}

	const before = clock.now();
	const collected = sessions === undefined ? 0 : await sessions(before);
	return collected + (tokens === undefined ? 0 : await tokens(before));
}
