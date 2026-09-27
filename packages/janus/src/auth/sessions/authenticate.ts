/**
 * `authenticate`: the user and the session a request presents, or `null` for
 * anonymous — and the renewal of a session used past its `renewAfter`.
 */

import type { ResolvedType } from '../config';
import { type AnyUser, type Context, toUser } from '../context';
import type { SessionRecord } from '../port/types';
import { hashSecret } from '../secrets';
import type { Authenticated, RequestLike } from '../types';
import { toSession } from './open-session';
import { presentedToken } from './presented-token';

/** Answers the user and the session `request` presents, or `null` for anonymous. */
export async function authenticate(
	context: Context,
	request: RequestLike,
	options?: { readonly type?: string },
): Promise<Authenticated<AnyUser> | null> {
	const { store, clock, config } = context;
	const token = presentedToken(request, config.cookie.name);
	if (token === null) return null;

	const session = await store.sessions.findSessionByTokenHash(
		hashSecret(token),
	);
	// Lapsed, revoked, or gone: anonymous. Expiry is decided here, against
	// this clock — a store may still hold a session past its term.
	const now = clock.now().getTime();
	if (
		session === null ||
		session.revokedAt !== null ||
		session.expiresAt.getTime() <= now
	) {
		return null;
	}

	// A user gone, inactive, or of another type than asked for is
	// anonymous: the session stands, and proves nothing here.
	const user = await store.users.findUser(session.userId);
	if (
		user === null ||
		!user.active ||
		(options?.type !== undefined && user.type !== options.type)
	) {
		return null;
	}

	const type = config.types.get(user.type);
	if (type === undefined || !renewalDue(type, session, now)) {
		return {
			user: toUser(user),
			session: toSession(session),
			token,
			renewed: false,
		};
	}

	const extended = await store.sessions.extendSession(
		session.id,
		new Date(now + type.lifespanMs),
	);
	// Revoked between the read and the renewal: anonymous, and never
	// brought back.
	if (extended === null) return null;
	return {
		user: toUser(user),
		session: toSession(extended),
		token,
		renewed: true,
	};
}

/**
 * Whether a session is renewed now: once `renewAfter` has passed since it
 * was opened or last renewed — the lifespan minus what is left — so a busy
 * session is written at most once per period.
 */
function renewalDue(
	type: ResolvedType,
	session: SessionRecord,
	now: number,
): boolean {
	return (
		type.renewAfterMs !== null &&
		type.lifespanMs - (session.expiresAt.getTime() - now) >= type.renewAfterMs
	);
}
