/**
 * `@nxgt/janus-graphql` — `@nxgt/janus` in a GraphQL server.
 *
 * - `useJanus({ auth, access?, type?, clock?, loaders?, conditions? })` —
 *   the envelop plugin: `ctx.janus` on every request, and the directives —
 *   `@authenticated`, `@fresh`, `@permission` — applied to the schema;
 * - `janusTypeDefs` — the directives' SDL, also shipped as
 *   `graphql/janus.graphqls`;
 * - `applyJanusDirectives(schema, { auth })` — the schema transform alone;
 * - `requireUser(ctx, { type? })`, `requireFresh(ctx, maxAge)` and
 *   `can(ctx, permission, object)` — the calls a resolver makes itself;
 * - `janusMaskError({ report?, fallback? })` — Yoga's `maskError`: a
 *   `JanusError` as its code and status, `STORE_FAILED` as 503 and never as
 *   401 or 403, and every 5xx handed to `report`.
 * - `janusGraphQLError(error)` — a `JanusError` as the `GraphQLError` the
 *   client reads, and `denial(code, message?)` — a denial of your own.
 * - `janusConnection({ auth, access?, type?, clock?, upgrade? })` —
 *   subscriptions over graphql-ws: `onConnect` and `context` for its
 *   `useServer()`, a connection authenticated from its `connectionParams`
 *   or its upgrade request.
 *
 * It defines no error class: a denial is a `GraphQLError`, and what it lets
 * through is `@nxgt/janus`'s own.
 */

export { janusConnection } from './connection/connection';
export type {
	ConnectionContext,
	JanusConnection,
	JanusConnectionOptions,
} from './connection/types';
export {
	applyJanusDirectives,
	type JanusDirectivesOptions,
} from './directives/apply';
export {
	type DenialCode,
	denial,
	type JanusMaskErrorOptions,
	janusGraphQLError,
	janusMaskError,
	type MaskError,
} from './errors';
export { requireFresh } from './fresh';
export { can, type RequireUserOptions, requireUser } from './helpers';
export { useJanus } from './plugin';
export { janusTypeDefs } from './sdl';
export type {
	Auth,
	JanusContext,
	JanusOnContext,
	JanusOptions,
	UserOfAuth,
} from './types';
export type { Conditions, LoadedObject, Loaders } from './wiring';
