import { UnsupportedError } from '../errors/janus-error';
import { isId, mintId } from '../ids/id';
import type { ResolvedType } from './config';
import {
	type AnyUser,
	type Context,
	findRecord,
	getRecord,
	idOf,
	toUser,
} from './context';
import type { SessionRecord, UserRecord } from './port/types';
import { hashSecret, mintSecret } from './secrets';
import type {
	Authenticated,
	HeaderRecord,
	RequestLike,
	Session,
	SharedApi,
	SignedIn,
} from './types';

/** `SharedApi`, degenericised: `janus()` casts it to the typed form once. */
export type InternalSharedApi = Omit<SharedApi<AnyUser>, 'authenticate'> & {
	authenticate(
		request: RequestLike,
		options?: { readonly type?: string },
	): Promise<Authenticated<AnyUser> | null>;
};

/** A session as application code sees it: everything but the token's hash. */
export function toSession(record: SessionRecord): Session {
	const { tokenHash: _, ...session } = record;
	return session;
}

/**
 * Opens a session for a user who just proved who they are. The token is in
 * the answer and nowhere else: the store holds its hash.
 */
export async function openSession(
	context: Context,
	type: ResolvedType,
	user: UserRecord,
): Promise<SignedIn<AnyUser>> {
	const now = context.clock.now();
	const token = mintSecret();
	const record: SessionRecord = {
		id: mintId(now.getTime()),
		tokenHash: hashSecret(token),
		userId: user.id,
		authenticatedAt: now,
		expiresAt: new Date(now.getTime() + type.lifespanMs),
		revokedAt: null,
		createdAt: now,
	};

	await context.store.sessions.insertSession(record);
	return { user: toUser(user), session: toSession(record), token };
}

/** Everything `janus()` answers whatever its user types. */
export function sharedApi(context: Context): InternalSharedApi {
	const { store, clock, config } = context;

	return {
		async authenticate(request, options) {
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
			let current = session;
			let renewed = false;

			// Renewed once `renewAfter` has passed since it was opened or last
			// renewed — the lifespan minus what is left — so a busy session is
			// written at most once per period.
			if (
				type !== undefined &&
				type.renewAfterMs !== null &&
				type.lifespanMs - (session.expiresAt.getTime() - now) >=
					type.renewAfterMs
			) {
				const extended = await store.sessions.extendSession(
					session.id,
					new Date(now + type.lifespanMs),
				);
				// Revoked between the read and the renewal: anonymous, and never
				// brought back.
				if (extended === null) return null;
				current = extended;
				renewed = true;
			}

			return {
				user: toUser(user),
				session: toSession(current),
				token,
				renewed,
			};
		},

		async signOut(request) {
			const token = presentedToken(request, config.cookie.name);
			if (token === null) return false;

			const session = await store.sessions.findSessionByTokenHash(
				hashSecret(token),
			);
			if (session === null) return false;
			return store.sessions.revokeSession(session.id, clock.now());
		},

		async signOutEverywhere(user, options) {
			const id = idOf(user);
			if (!isId(id)) return 0;
			// An `except` that is no id this package minted names no session:
			// every session goes, as it would for an unknown one.
			return options?.except === undefined || !isId(options.except)
				? store.sessions.revokeUserSessions(id, clock.now())
				: store.sessions.revokeUserSessions(id, clock.now(), options.except);
		},

		async findUser(id) {
			const record = await findRecord(context, id, null);
			return record === null ? null : toUser(record);
		},

		async getUser(id) {
			return toUser(await getRecord(context, id, null, 'getUser'));
		},

		cookie: cookieOf(context),

		async collectExpired() {
			const collect = store.sessions.deleteExpiredSessions;
			if (!context.capabilities.collectExpired || collect === undefined) {
				throw new UnsupportedError(
					'collectExpired: store.sessions does not implement deleteExpiredSessions — its store expires sessions on its own, or implement the method',
					{ slot: 'sessions', operation: 'deleteExpiredSessions' },
				);
			}
			return collect(clock.now());
		},

		types: [...config.types.keys()],
	};
}

function cookieOf(context: Context): SharedApi<AnyUser>['cookie'] {
	const { name, domain, path, sameSite, secure } = context.config.cookie;
	const attributes = [
		`Path=${path}`,
		...(domain === null ? [] : [`Domain=${domain}`]),
		'HttpOnly',
		`SameSite=${sameSite[0]?.toUpperCase()}${sameSite.slice(1)}`,
		...(secure ? ['Secure'] : []),
	].join('; ');

	return {
		name,
		serialize: (token: string, session: Session) =>
			`${name}=${token}; Expires=${session.expiresAt.toUTCString()}; ${attributes}`,
		clear: () =>
			`${name}=; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; ${attributes}`,
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
	request: RequestLike,
	cookieName: string,
): string | null {
	const headers = headersOf(request);
	const read = (name: string): string | null => {
		if (headers instanceof Headers) return headers.get(name);
		for (const [key, value] of Object.entries(headers)) {
			if (key.toLowerCase() !== name || value === undefined) continue;
			return typeof value === 'string' ? value : value.join(', ');
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

/**
 * The headers of whatever was passed: a `Request`, `Headers`, anything with a
 * `headers` property — Node's `IncomingMessage` — or a plain record.
 */
function headersOf(request: RequestLike): Headers | HeaderRecord {
	if (request instanceof Headers) return request;
	const inner = (request as { headers?: unknown }).headers;
	if (inner instanceof Headers) return inner;
	if (typeof inner === 'object' && inner !== null) return inner as HeaderRecord;
	return request as HeaderRecord;
}
