/**
 * A session as application code sees it, who a request belongs to, and what
 * a session token is read from.
 *
 * Part of what `janus()` hands back; `../types` gathers it.
 */

import type { SessionRecord } from '../port/sessions';

/** A session, as application code sees it: everything but the token's hash. */
export type Session = Omit<SessionRecord, 'tokenHash'>;

/** Who a request belongs to. */
export interface Authenticated<U> {
	readonly user: U;
	readonly session: Session;
	/** The token the request presented. */
	readonly token: string;
	/**
	 * Whether this call renewed the session. When it did, `session.expiresAt`
	 * moved: send the cookie again with `auth.cookie.serialize(token, session)`.
	 */
	readonly renewed: boolean;
}

/** What `authenticate` and `signOut` read a session token from. */
export type RequestLike =
	| Request
	| Headers
	| { readonly headers: Headers | HeaderRecord }
	| HeaderRecord;

/** Headers as Node's `IncomingMessage` and most frameworks hold them. */
export type HeaderRecord = {
	readonly [name: string]: string | readonly string[] | undefined;
};
