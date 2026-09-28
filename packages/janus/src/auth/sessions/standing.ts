/**
 * The standing session a request presents — one rule for `authenticate` and
 * `stepUp.confirm`, so the two never disagree on what "signed in" means.
 */

import type { Context } from '../context';
import type { SessionRecord } from '../port/types';
import { hashSecret } from '../secrets';
import type { RequestLike } from '../types';
import { presentedToken } from './presented-token';

/** A standing session, and the session token that presented it. */
export interface Presented {
	readonly token: string;
	readonly session: SessionRecord;
}

/**
 * Answers the session `request` presents, with its token — or `null` when
 * none stands: no token, or a session gone, revoked or lapsed. Expiry is
 * decided here, against the context's clock: a store may still hold a
 * session past its term.
 */
export async function standingSession(
	context: Context,
	request: RequestLike,
): Promise<Presented | null> {
	const token = presentedToken(request, context.config.cookie.name);
	if (token === null) return null;

	const session = await context.store.sessions.findSessionByTokenHash(
		hashSecret(token),
	);
	const now = context.clock.now().getTime();
	return session === null ||
		session.revokedAt !== null ||
		session.expiresAt.getTime() <= now
		? null
		: { token, session };
}
