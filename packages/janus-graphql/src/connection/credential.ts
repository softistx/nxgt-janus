/**
 * The credential a graphql-ws connection presents, and the connections
 * `janusConnection().onConnect` accepted: what each operation on one is
 * authenticated from.
 */

import type { RequestLike } from '@nxgt/janus';
import type { ConnectionContext } from './types';

/** Where the upgrade request is, when the transport does not say `extra.request`. */
export type Upgrade = (ctx: ConnectionContext) => RequestLike | undefined;

/** The scheme `@nxgt/janus` reads a session token from — any case, as it does. */
const BEARER = /^\s*bearer(?:\s|$)/i;

/**
 * The connection's credential, as `auth.authenticate` reads one:
 *
 * 1. `connectionParams.authorization`, when it is a `Bearer` token — a
 *    non-browser client's `'Bearer <token>'`;
 * 2. otherwise the upgrade request itself, read as any request is —
 *    `Authorization`, then `X-Session-Token`, then the session cookie a
 *    browser sends with it.
 *
 * **The first present wins, not the first valid one**, as in `@nxgt/janus`:
 * a lapsed token in `connectionParams` beside a live cookie is refused. An
 * `authorization` of another scheme (`Basic`) is not a session credential,
 * as in `@nxgt/janus`, and does not count. `null` when there is nothing to
 * read, or an `authorization` that is not a string — refused, as a
 * client's mistake.
 */
export function credentialOf(
	ctx: ConnectionContext,
	upgrade: Upgrade | undefined,
): RequestLike | null {
	const params = ctx.connectionParams;
	if (params !== undefined && Object.hasOwn(params, 'authorization')) {
		const { authorization } = params;
		if (typeof authorization !== 'string') return null;
		// A record, not `Headers`, which would throw on a value no header may
		// hold: a client's mistake is a refusal, never a 4500.
		if (BEARER.test(authorization)) return { authorization };
	}
	const request =
		upgrade === undefined
			? (ctx.extra as { readonly request?: RequestLike } | null)?.request
			: upgrade(ctx);
	return request ?? null;
}

/**
 * The credential of each connection `onConnect` accepted, by its `extra`:
 * the one object graphql-ws hands every callback of a connection, and that
 * Yoga's recipe spreads into the context it builds. A `WeakMap`, so a
 * closed connection takes its entry with it, and nothing a request carries
 * can name one.
 */
const accepted = new WeakMap<object, RequestLike>();

/** Remembers `credential` as the one `ctx`'s connection presented. */
export function accept(ctx: ConnectionContext, credential: RequestLike) {
	const { extra } = ctx;
	if (typeof extra !== 'object' || extra === null) {
		throw new TypeError(
			"janusConnection(): the connection's extra is not an object — pass the context graphql-ws gave onConnect",
		);
	}
	accepted.set(extra, credential);
}

/**
 * The credential of the connection a context was built for, or `undefined`
 * for one no `onConnect` accepted — and for every HTTP request.
 */
export function acceptedOf(context: unknown): RequestLike | undefined {
	const extra = (context as { readonly extra?: unknown } | null)?.extra;
	if (typeof extra !== 'object' || extra === null) return undefined;
	return accepted.get(extra);
}
