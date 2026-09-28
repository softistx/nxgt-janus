/**
 * `useJanus()`, the envelop plugin — for Yoga, or any server built on
 * envelop.
 */

import type { Plugin } from '@envelop/core';
import type { RequestLike } from '@nxgt/janus';
import type { GraphQLSchema } from 'graphql';
import { acceptedOf } from './connection/credential';
import { createJanusContext } from './context';
import { applyJanusDirectives } from './directives/apply';
import { checkWiring } from './options';
import { resendRenewed, track } from './renewal';
import type { Auth, JanusContext, JanusOptions, UserOfAuth } from './types';

/**
 * The plugin that wires `@nxgt/janus` into a GraphQL server:
 *
 * - every request's context gets `ctx.janus` — `user()` and `session()`,
 *   authenticated lazily and once, and `access` when it is given;
 * - every schema the server is given has its directives applied, once, by
 *   `applyJanusDirectives()`.
 *
 * ```ts
 * createYoga({
 *   schema: createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers }),
 *   plugins: [useJanus({ auth, access })],
 *   maskedErrors: { maskError: janusMaskError() },
 * });
 * ```
 *
 * `type` treats a user of any other type as anonymous, as
 * `auth.authenticate(request, { type })` does. `clock` is what `@fresh` and
 * `requireFresh()` read the time from — the one given to `janus()`.
 * `loaders` and `conditions` are what `@permission` needs beside `access`:
 * the objects it checks by id, and the `ctx` of the conditions it reaches.
 *
 * A session `authenticate` renewed for a request that presented it as the
 * session cookie is sent again, `Set-Cookie` on Yoga's response
 * (`onResponse`), so a browser keeps the new expiry. Not to a bearer token or
 * `X-Session-Token`, and never when nothing authenticated.
 *
 * An operation over graphql-ws has no request: its `ctx.janus`
 * authenticates the credential its connection presented, once
 * `janusConnection().onConnect` accepted it — and has no response to carry a
 * renewed cookie.
 */
export function useJanus<
	A extends Auth<{ readonly type: string; readonly id: string }>,
	P extends object | undefined = undefined,
	const T extends UserOfAuth<A>['type'] = UserOfAuth<A>['type'],
>(
	options: JanusOptions<A, P, T>,
): Plugin<JanusContext<A, P, T>> & {
	readonly onResponse: (payload: {
		readonly request: Request;
		readonly response: Response;
	}) => Promise<void>;
} {
	const { auth, access, type, clock, loaders, conditions } = options;
	checkWiring('useJanus()', { auth, access, clock });
	const applied = new WeakSet<GraphQLSchema>();

	return {
		onContextBuilding: ({ context, extendContext }) => {
			const { request } = context as { readonly request?: RequestLike };
			const janus = createJanusContext(request ?? acceptedOf(context), {
				auth,
				access: access as { readonly can: unknown } | undefined,
				type,
				clock,
			});
			if (typeof request === 'object' && request !== null) {
				track(request, janus);
			}
			extendContext({ janus } as unknown as Partial<JanusContext<A, P, T>>);
		},
		// `replaceSchema` calls this hook again with the schema it was given:
		// the one it made is remembered, or it would transform it for ever.
		onSchemaChange: ({ schema, replaceSchema }) => {
			if (applied.has(schema)) return;
			const next = applyJanusDirectives(schema, {
				auth,
				...(type === undefined ? {} : { type }),
				access: access as { readonly model: unknown } | undefined,
				loaders,
				conditions,
			});
			applied.add(next);
			replaceSchema(next);
		},
		// Yoga's own hook, which envelop ignores: the HTTP response, once made.
		onResponse: (payload) => resendRenewed(payload, auth.cookie),
	};
}
