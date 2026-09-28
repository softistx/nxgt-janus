/**
 * Freshness: whether the request's session proved who it is recently enough
 * — the check `@fresh` runs before a field, and `requireFresh()` in a
 * resolver. Both are `@nxgt/janus`'s `assertFresh`, on the clock given to
 * `useJanus({ clock })`.
 */

import {
	assertFresh,
	type Duration,
	parseDuration,
	type Session,
} from '@nxgt/janus';
import { clockOf, janusOf } from './context';
import { denial, rethrown } from './errors';

/**
 * The request's session, once it proved who it is less than `maxAgeMs` ago
 * — or a denial: `UNAUTHENTICATED` 401 for an anonymous request,
 * `STEP_UP_REQUIRED` 403 for an older session. A store that cannot answer is
 * `SERVICE_UNAVAILABLE` 503, never either of them.
 */
export async function freshSession(
	janus: { session(): Promise<Session | null> },
	maxAgeMs: number,
): Promise<Session> {
	const session = await janus.session().then(undefined, rethrown);
	if (session === null) throw denial('UNAUTHENTICATED');
	try {
		assertFresh(session, maxAgeMs, clockOf(janus));
	} catch (error) {
		rethrown(error);
	}
	return session;
}

/**
 * The request's session, once it proved who it is less than `maxAge` ago —
 * signed in, or confirmed since by `auth.stepUp.confirm` — or a denial:
 * `UNAUTHENTICATED` 401 for an anonymous request, `STEP_UP_REQUIRED` 403 for
 * an older session, which tells the client to ask for a step-up.
 *
 * ```ts
 * await requireFresh(ctx, '10m'); // before changing the e-mail
 * ```
 *
 * `maxAge` is a duration with its unit — `'10m'`, `'600s'` — never a bare
 * number, which `@nxgt/janus` reads as milliseconds where `@fresh` reads
 * seconds: a `TypeError`, as any other malformed duration.
 */
export async function requireFresh(
	ctx: {
		readonly janus: {
			user(): Promise<unknown>;
			session(): Promise<Session | null>;
		};
	},
	maxAge: Exclude<Duration, number>,
): Promise<Session> {
	if (typeof maxAge !== 'string') {
		throw new TypeError(
			"requireFresh(): maxAge is a duration with its unit, such as '10m' — a bare number would be milliseconds, where @fresh reads seconds",
		);
	}
	const maxAgeMs = parseDuration(maxAge, 'requireFresh(): maxAge');
	return freshSession(janusOf(ctx, 'requireFresh()'), maxAgeMs);
}
