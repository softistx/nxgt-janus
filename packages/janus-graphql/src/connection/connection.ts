/**
 * `janusConnection()`: authenticated subscriptions over graphql-ws.
 */

import { createJanusContext } from '../context';
import { checkWiring } from '../options';
import type { Auth, UserOfAuth } from '../types';
import { accept, acceptedOf, credentialOf } from './credential';
import type { JanusConnection, JanusConnectionOptions } from './types';

/**
 * The pieces of graphql-ws's `useServer()` that authenticate a WebSocket
 * connection, for Yoga's recommended setup:
 *
 * ```ts
 * const connection = janusConnection({ auth });
 * useServer({
 *   onConnect: connection.onConnect,
 *   execute: (args) => args.rootValue.execute(args),
 *   subscribe: (args) => args.rootValue.subscribe(args),
 *   onSubscribe: async (ctx, _id, params) => { … yoga.getEnveloped({ ...ctx, … }) … },
 * }, wsServer);
 * ```
 *
 * `onConnect` reads the connection's credential — `connectionParams`'
 * `authorization`, else the upgrade request's headers and cookie — and
 * refuses it unless it authenticates, as a user of `type` when it is given.
 * Each operation on the connection then gets a `ctx.janus` of its own from
 * `useJanus()`, authenticated again from that credential when a field asks:
 * `@authenticated`, `@fresh` and `@permission` hold as over HTTP, and a
 * session revoked since the connection opened is refused at the next
 * subscribe.
 *
 * A server without Yoga passes `context` too, and applies the directives
 * with `applyJanusDirectives()`.
 */
export function janusConnection<
	A extends Auth<{ readonly type: string; readonly id: string }>,
	P extends object | undefined = undefined,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(options: JanusConnectionOptions<A, P, T>): JanusConnection<A, P, T> {
	const { auth, access, type, clock } = options;
	checkWiring('janusConnection()', { auth, access, clock });
	if (options.upgrade !== undefined && typeof options.upgrade !== 'function') {
		throw new TypeError(
			'janusConnection(): upgrade is not a function — pass (ctx) => the upgrade request, or leave it out to read ctx.extra.request',
		);
	}
	const upgrade = options.upgrade?.bind(options);
	const wiring = {
		auth,
		access: access as { readonly can: unknown } | undefined,
		type,
		clock,
	};

	return {
		onConnect: async (ctx) => {
			const credential = credentialOf(ctx, upgrade);
			if (credential === null) return false;
			// An outage rejects here, and graphql-ws closes the socket 4500:
			// never `false`, which a client reads as a refusal.
			const current = await auth.authenticate(
				credential,
				type === undefined ? undefined : { type },
			);
			if (current === null) return false;
			accept(ctx, credential);
			return true;
		},
		context: (ctx) =>
			({ janus: createJanusContext(acceptedOf(ctx), wiring) }) as never,
	};
}
