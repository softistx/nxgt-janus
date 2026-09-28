import {
	assertFresh,
	type Clock,
	type Duration,
	parseDuration,
	type Session,
} from '@nxgt/janus';
import type { MiddlewareHandler } from 'hono';

/** What `fresh()` takes besides `maxAge`. */
export interface FreshOptions {
	/** The clock given to `janus()`, when it is not the system's: `fixedClock` in a spec. */
	readonly clock?: Clock;
}

/**
 * The middleware that lets a route run only for a session that proved who
 * it is less than `maxAge` ago — signed in, or confirmed by
 * `auth.stepUp.confirm`, since. Behind `session(auth)`, which sets
 * `c.var.session`:
 *
 * ```ts
 * app.delete('/account', session(auth, { required: true }), fresh('10m'), deleteAccount);
 * ```
 *
 * A session older than that throws `STEP_UP_REQUIRED`, which `janusErrors()`
 * answers 403 with `{ code: 'STEP_UP_REQUIRED' }`: the client asks for a
 * step-up, then sends the request again. An anonymous request is answered
 * 401, with no body, as `session(auth, { required: true })` answers it.
 *
 * A `maxAge` that is not a duration is a `TypeError` here, when the app is
 * wired — not on the first request.
 * No `session()` before it is a `TypeError` at the first request — a
 * wiring error, not an anonymous 401 — as for `permission()`.
 */
export function fresh(
	maxAge: Duration,
	options: FreshOptions = {},
): MiddlewareHandler<{
	// biome-ignore lint/style/useNamingConvention: Hono's `Env` names the key, not us.
	Variables: { session: Session | null };
}> {
	const maxAgeMs = parseDuration(maxAge, 'fresh: maxAge');
	return async (c, next) => {
		const current = c.var.session;
		if (current === undefined) {
			throw new TypeError(
				'fresh(): c.var.session is not set — put session(auth) before it',
			);
		}
		if (current === null) return c.body(null, 401);
		assertFresh(current, maxAgeMs, options.clock);
		await next();
	};
}
