/**
 * The public types of `janusConnection()`: what it takes, and the pieces
 * it answers for graphql-ws's `useServer()`. Typed by their shape, so the
 * package imports nothing from graphql-ws. Nothing here runs.
 */

import type { Clock, RequestLike } from '@nxgt/janus';
import type { JanusContext, UserOfAuth } from '../types';

/**
 * The part of graphql-ws's `Context` read here: the `connectionParams` the
 * client sent with `connection_init`, and the transport's `extra` —
 * `{ socket, request }` for `graphql-ws/use/ws`.
 */
export interface ConnectionContext {
	readonly connectionParams?: Readonly<Record<string, unknown>> | undefined;
	readonly extra: unknown;
}

/** What `janusConnection()` takes. */
export interface JanusConnectionOptions<A, P, T extends string> {
	/** What `janus()` answered. */
	readonly auth: A;
	/**
	 * What `permissions()` answered: `ctx.janus.access` in the context
	 * `context()` builds. `useJanus()`'s own when Yoga builds it.
	 */
	readonly access?: P;
	/** Only a user of this type may connect; any other is refused. */
	readonly type?: T;
	/** The clock `@fresh` reads in the context `context()` builds. */
	readonly clock?: Clock;
	/**
	 * The upgrade request of a connection, for a transport whose `extra`
	 * does not carry it as `request` — Bun's is `{ socket }`:
	 * `upgrade: (ctx) => ctx.extra.socket.data.request`, with the request
	 * passed to `server.upgrade(req, { data: { request: req } })`.
	 *
	 * A method, so `ctx` may be annotated with the transport's own `extra`.
	 */
	upgrade?(ctx: ConnectionContext): RequestLike | undefined;
}

/** What `janusConnection()` answers: the pieces of graphql-ws's `useServer()`. */
export interface JanusConnection<
	A,
	P = undefined,
	T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
> {
	/**
	 * `useServer({ onConnect })`: accepts a connection whose credential
	 * authenticates, and answers `false` for any other — graphql-ws closes
	 * it `4403: Forbidden`. An outage rejects, never `false`: the transport
	 * closes it `4500`, and the client does not retry it as a refusal.
	 */
	readonly onConnect: (ctx: ConnectionContext) => Promise<boolean>;
	/**
	 * `useServer({ context })`, for a server without Yoga: `ctx.janus` for
	 * one operation, authenticated from the connection's credential. Yoga's
	 * recipe builds the context itself, and `useJanus()` finds the
	 * connection there: leave this out.
	 */
	readonly context: (ctx: ConnectionContext) => JanusContext<A, P, T>;
}
