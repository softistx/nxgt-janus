/**
 * `@nxgt/janus-graphql` — `@nxgt/janus` in a GraphQL server.
 *
 * - `useJanus({ auth, access?, type?, loaders?, conditions? })` — the
 *   envelop plugin: `ctx.janus` on every request, and the directives —
 *   `@authenticated`, `@permission` — applied to the schema;
 * - `janusTypeDefs` — the directives' SDL, also shipped as
 *   `graphql/janus.graphqls`;
 * - `applyJanusDirectives(schema, { auth })` — the schema transform alone;
 * - `requireUser(ctx, { type? })` and `can(ctx, permission, object)` — the
 *   calls a resolver makes itself;
 * - `janusMaskError(fallback?)` — Yoga's `maskError`: a `JanusError` as its
 *   code and status, `STORE_FAILED` as 503 and never as 401 or 403.
 *
 * It defines no error class: a denial is a `GraphQLError`, and what it lets
 * through is `@nxgt/janus`'s own.
 */

export {
	applyJanusDirectives,
	type JanusDirectivesOptions,
} from './directives/apply';
export {
	type DenialCode,
	denial,
	janusGraphQLError,
	janusMaskError,
	type MaskError,
} from './errors';
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
