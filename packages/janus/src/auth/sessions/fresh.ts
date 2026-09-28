/**
 * `assertFresh`: whether a session proved who it is recently enough for a
 * sensitive action — signed in, or confirmed by a step-up, less than
 * `maxAge` ago.
 */

import { StepUpRequiredError } from '../../errors/janus-error';
import { type Clock, systemClock } from '../../time/clock';
import { type Duration, parseDuration } from '../../time/duration';
import type { Session } from '../types';

/**
 * Refuses a session whose credentials were last presented `maxAge` ago or
 * more — at its sign-in, or since by `stepUp.confirm` — with
 * `STEP_UP_REQUIRED` (403): ask for a step-up, then run the action again. One
 * field of the session `authenticate` already answered, so no store is read.
 *
 * ```ts
 * const current = await auth.authenticate(request);
 * if (current === null) return new Response(null, { status: 401 });
 * assertFresh(current.session, '10m'); // STEP_UP_REQUIRED past ten minutes
 * ```
 *
 * Pass the `clock` given to `janus()` when it is not the system's. A
 * `maxAge` that is not a duration is a `TypeError`: it is written in the
 * code, never read from a request.
 */
export function assertFresh(
	session: Pick<Session, 'authenticatedAt' | 'userId'>,
	maxAge: Duration,
	clock: Clock = systemClock,
): void {
	const maxAgeMs = parseDuration(maxAge, 'assertFresh: maxAge');
	const age = clock.now().getTime() - session.authenticatedAt.getTime();
	if (age >= maxAgeMs) {
		throw new StepUpRequiredError(
			'assertFresh: the session proved who it is longer ago than maxAge — confirm with a step-up',
			{ userId: session.userId },
		);
	}
}
