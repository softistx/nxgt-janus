import { SessionError, UnsupportedError } from '../errors/janus-error';
import { isIdentityId, mintIdentityId } from '../ids/identity-id';
import { type Context, getRecord, toIdentity } from './context';
import type { SessionRecord } from './port/types';
import { hashSecret, mintSecret } from './secrets';
import type { HeaderSource, Identities, Resolved, Session } from './types';

/** A session as application code sees it: everything but the token's hash. */
export function toSession(record: SessionRecord): Session {
	const { tokenHash: _, ...session } = record;
	return session;
}

const inactive = (where: string, identityId: string) =>
	new SessionError('IDENTITY_INACTIVE', `${where}: the identity is inactive`, {
		identityId,
		operation: where,
	});

export function sessionsOf(context: Context): Identities<unknown>['sessions'] {
	const { stores, clock, config } = context;

	return {
		async create(identityId, options) {
			const identity = await getRecord(context, identityId, 'sessions.create');
			if (identity.state !== 'active') {
				throw inactive('sessions.create', identity.id);
			}

			const now = clock.now();
			const token = mintSecret();
			const record: SessionRecord = {
				id: mintIdentityId(now.getTime()),
				tokenHash: hashSecret(token),
				identityId: identity.id,
				aal: options?.aal ?? 'aal1',
				authenticatedAt: now,
				expiresAt: new Date(now.getTime() + config.lifespanMs),
				revokedAt: null,
				createdAt: now,
			};

			await stores.sessions.insertSession(record);
			return { token, session: toSession(record) };
		},

		async resolve(headers) {
			const token = presentedToken(headers, config.cookie.name);
			if (token === null) return null;

			const record = await stores.sessions.findSessionByTokenHash(
				hashSecret(token),
			);
			// Lapsed, revoked, or gone: anonymous. Expiry is decided here, against
			// this clock — a store may still hold a session past its term.
			if (
				record === null ||
				record.revokedAt !== null ||
				record.expiresAt.getTime() <= clock.now().getTime()
			) {
				return null;
			}

			const identity = await stores.identities.findIdentity(record.identityId);
			if (identity === null) return null;
			if (identity.state !== 'active') {
				throw inactive('sessions.resolve', identity.id);
			}

			return {
				session: toSession(record),
				identity: toIdentity(identity),
			} satisfies Resolved<unknown>;
		},

		async extend(session) {
			const now = clock.now().getTime();
			const left = session.expiresAt.getTime() - now;

			if (session.revokedAt !== null || left <= 0) return null;
			// Not yet within the refresh window: answered as it is, nothing written.
			if (
				config.earliestRefreshMs !== null &&
				left > config.earliestRefreshMs
			) {
				return session;
			}

			const written = await stores.sessions.extendSession(
				session.id,
				new Date(now + config.lifespanMs),
			);
			return written === null ? null : toSession(written);
		},

		async revoke(sessionId) {
			if (!isIdentityId(sessionId)) return false;
			return stores.sessions.revokeSession(sessionId, clock.now());
		},

		async revokeAll(identityId, options) {
			if (!isIdentityId(identityId)) return 0;
			return options?.except === undefined
				? stores.sessions.revokeIdentitySessions(identityId, clock.now())
				: stores.sessions.revokeIdentitySessions(
						identityId,
						clock.now(),
						options.except,
					);
		},

		async collectExpired() {
			const collect = stores.sessions.deleteExpiredSessions;
			if (!context.capabilities.collectExpired || collect === undefined) {
				throw new UnsupportedError(
					'sessions.collectExpired: stores.sessions does not implement deleteExpiredSessions — its store expires sessions on its own, or implement the method',
					{ slot: 'sessions', operation: 'deleteExpiredSessions' },
				);
			}
			return collect(clock.now());
		},
	};
}

/**
 * The session token a request presents: `Authorization: Bearer`, then
 * `X-Session-Token`, then the cookie.
 *
 * **The first credential present wins, not the first valid one.** A browser
 * sending a lapsed bearer beside a live cookie is anonymous, and should fix its
 * header rather than be rescued in silence — the rule `resolve` in `nxgt-ory`'s
 * SDK learned. An `Authorization` header of another scheme (`Basic`) is not a
 * session credential, and does not count as one.
 */
export function presentedToken(
	headers: HeaderSource,
	cookieName: string,
): string | null {
	const read = (name: string): string | null => {
		if (headers instanceof Headers) return headers.get(name);
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() === name && value !== undefined) return value;
		}
		return null;
	};

	const authorization = read('authorization');
	if (authorization !== null) {
		const match = /^bearer(?:\s+(.*))?$/i.exec(authorization.trim());
		if (match) return match[1]?.trim() ?? '';
	}

	const header = read('x-session-token');
	if (header !== null) return header.trim();

	const cookie = read('cookie');
	if (cookie !== null) {
		for (const pair of cookie.split(';')) {
			const at = pair.indexOf('=');
			if (at !== -1 && pair.slice(0, at).trim() === cookieName) {
				return pair.slice(at + 1).trim();
			}
		}
	}

	return null;
}
