# @nxgt/janus-graphql

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) in a GraphQL
server: the signed-in user on the context, authenticated only when a field
asks, fields and types guarded by `@authenticated`, and every error answered
with the status it deserves — an outage as 503, never as 401 or 403.

An [envelop](https://the-guild.dev/graphql/envelop) plugin, so it runs in
[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) and any server built
on envelop.

```ts
import { janusMaskError, janusTypeDefs, type JanusContext, requireUser, useJanus } from '@nxgt/janus-graphql';
import { createSchema, createYoga, type YogaInitialContext } from 'graphql-yoga';
import { access } from './access'; // what permissions() answered
import { auth } from './auth'; // what janus() answered

type Context = YogaInitialContext & JanusContext<typeof auth, typeof access>;

const typeDefs = /* GraphQL */ `
	type Query {
		me: User @authenticated
		ward(id: ID!): Ward
	}
	type User { id: ID!, email: String }
	type Ward @authenticated(type: ["staff"]) { id: ID!, name: String }
`;

export const yoga = createYoga({
	schema: createSchema({
		typeDefs: [janusTypeDefs, typeDefs],
		resolvers: {
			Query: {
				me: async (_: unknown, __: unknown, ctx: Context) => ctx.janus.user(), // never null here
				ward: async (_: unknown, { id }: { id: string }, ctx: Context) => {
					const staff = await requireUser(ctx, { type: 'staff' }); // typed: a staff member
					return wards.find(id, staff.id);
				},
			},
		},
	}),
	plugins: [useJanus({ auth, access })],
	maskedErrors: { maskError: janusMaskError() }, // STORE_FAILED → 503, not "Unexpected error."
});
```

> **Not published yet.** The package is private while its first slice lands;
> `@permission` is declared in the SDL and comes next — see the
> [roadmap](docs/roadmap.md).

## Install

```sh
bun add @nxgt/janus-graphql @nxgt/janus graphql @graphql-tools/utils @envelop/core
```

Every peer is required:

| Peer | Range | Why |
| --- | --- | --- |
| `@nxgt/janus` | the workspace's own version | A **peer**, never a dependency: this package defines no error class, so the `JanusError` a resolver throws is the one you import |
| `graphql` | `^16.9.0 \|\| ^17.0.0` | The schema and `GraphQLError` are yours; a second copy of `graphql` fails every schema |
| `@graphql-tools/utils` | `>=10.0.0 <13` | `mapSchema` and `getDirective`, which apply the directives |
| `@envelop/core` | `^5.0.0` | Types only — the `Plugin` `useJanus()` answers. Yoga already brings it |
| `typescript` | `^6.0.3` | As for `@nxgt/janus` |

Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`: the
declarations import without extensions, so `nodenext` is not supported.

The SDL ships twice: `janusTypeDefs`, a string for `createSchema`, and
`graphql/janus.graphqls` in the package, for a code generator or an editor
that reads files — `node_modules/@nxgt/janus-graphql/graphql/janus.graphqls`.

## API

| Export | What it is |
| --- | --- |
| `useJanus({ auth, access?, type? })` | The envelop plugin. Adds `ctx.janus` to every request's context, and applies the directives to every schema the server is given, once. `type` treats a user of any other type as anonymous |
| `ctx.janus.user()`, `ctx.janus.session()` | Who the request belongs to, and the session it presented — `null` for an anonymous request. `auth.authenticate(request)` runs the first time either is asked, once per request, and never when neither is |
| `ctx.janus.access` | The `permissions()` instance given to `useJanus()`. Absent from the type — and from the context — without one |
| `janusTypeDefs` | The SDL: `@authenticated`, `@permission` and the `PermissionDenial` enum. The same text as `graphql/janus.graphqls` |
| `@authenticated(type: [String!])` | On a field, a type or an interface. A signed-in user, of one of the `type`s when it names some. Anonymous: `UNAUTHENTICATED`. Another type: `FORBIDDEN`. Every one that applies — the field's, its type's, its interfaces' — must hold |
| `@permission(name, type, id, onDeny)` | **Coming.** Declared, and refused by `applyJanusDirectives` until it is enforced — see the [roadmap](docs/roadmap.md) |
| `applyJanusDirectives(schema, { auth, type? })` | The schema transform alone — what `useJanus()` runs — to check a schema in a test or a build script. Throws a `TypeError` naming the field for a directive no request could pass. Its guards read `ctx.janus`, which only `useJanus()` builds |
| `requireUser(ctx, { type? })` | The signed-in user, narrowed to `type` — one or a list — or a denial: `UNAUTHENTICATED`, `FORBIDDEN` |
| `can(ctx, permission, object, options?)` | `access.can` for the request's user, typed as `access.can` is. Anonymous answers `false` |
| `janusMaskError(fallback?)` | Yoga's `maskedErrors.maskError`: a `JanusError` a resolver let through answered with its code and status; anything else to `fallback` |
| `janusGraphQLError(error)` | A `JanusError` as the `GraphQLError` the client reads: its code, its status, and only what the client can act on |
| `denial(code, message?)` | A denial of your own: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404 |
| `JanusContext<typeof auth, typeof access?, Type?>` | What `useJanus()` adds to the context, for your resolvers' `ctx` |
| `JanusOptions`, `JanusOnContext`, `JanusDirectivesOptions`, `RequireUserOptions`, `Auth`, `UserOfAuth`, `DenialCode`, `MaskError` | The types of the arguments and answers above |

## Errors

This package defines **no error class**. A denial is a `GraphQLError`, and
every one carries a `code` and the HTTP status Yoga answers with:

```json
{ "errors": [{ "message": "Not signed in", "path": ["me"], "extensions": { "code": "UNAUTHENTICATED" } }] }
```

| Code | Status | When |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | An anonymous request reached a guarded field, or `requireUser()` |
| `FORBIDDEN` | 403 | A user of a type the directive or `requireUser()` does not name |
| `NOT_FOUND` | 404 | `denial('NOT_FOUND')`, and `@permission`'s default once it lands |
| `SERVICE_UNAVAILABLE` | 503 | A store could not answer — `STORE_FAILED`. **Never a denial** |
| any other `JanusErrorCode` | its [`statusOf`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md) | A `JanusError` a resolver let through: `CREDENTIALS_INVALID` 401, `LOGIN_TAKEN` 409, … |

The status sits in `extensions.http.status`, which Yoga reads to answer the
HTTP response and strips from the body. `USER_INVALID` adds `issues`,
`PASSWORD_TOO_SHORT` `minLength` and `CODE_INVALID` `attemptsLeft`; nothing
else — never `reason`, `login`, a hash prefix or a cause. The message is a
fixed one per status, never the core's: read `code`. Detail, and the status of a
response with several errors: [the errors guide](docs/guide/errors.md).

## Traps

- **Without `janusMaskError()`, a `JanusError` from a resolver is Yoga's
  masked 500.** A guarded field and `requireUser()` answer an outage 503 on
  their own; `ctx.janus.user()` read directly, or `auth.signIn` in a mutation,
  does not. Wire `maskedErrors: { maskError: janusMaskError() }`.
- **`ctx.janus.user()` is `null` where no directive guards the field.** Read
  it only where anonymous is a valid answer, or call `requireUser(ctx)`.
- **A type's `@authenticated` guards its fields, not the field that returns
  it.** `type Ward @authenticated` leaves `Query.ward` open: its resolver runs
  for an anonymous request, and the error lands on `ward.name`. Put the
  directive on the field too — or call `requireUser()`, as above — when the
  lookup itself must not run.
- **One refused field sets the status of the whole response.** Yoga answers
  the highest `extensions.http.status` among the errors, so `{ open me }`
  from an anonymous request is a 401 whose `data` still holds `open`. A client
  reads `data` and `errors`, not only the status.
- **A renewed session is not sent back as a cookie.** `authenticate` renews
  a sliding session in passing, and nothing here sets `Set-Cookie` on the
  GraphQL response: a browser keeps the cookie with its old expiry. Sign in
  and renew through your HTTP routes, or send a bearer token.
- **`useJanus({ type })` narrows the whole server.** A user of any other type
  is anonymous everywhere, and a directive naming another type is refused
  when the schema is built.
- **`@permission` is refused, not ignored.** A schema that uses it throws a
  `TypeError` at start-up until it is enforced; check the permission in the
  resolver with `can(ctx, …)` meanwhile.
- **A context built without a request cannot authenticate.** `ctx.janus.user()`
  rejects with a `TypeError` — a transport that is not HTTP, such as a
  WebSocket, needs its own wiring, which is on the [roadmap](docs/roadmap.md).
- **A denial of a list field's item fails the whole list** where the item is
  non-null (`[Doctor!]!`), as GraphQL's null propagation always does. Guard
  the list field, or make the item nullable.

## Documentation

- [Guides](docs/README.md) — the context and the lazy user, and errors as statuses
- [Troubleshooting](docs/troubleshooting.md) — by the message or status you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Eighteen plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/`:

- five in `context.ts`: reading the user or the session where either may be
  `null` (twice), a field of another user type once `JanusContext` is narrowed,
  `ctx.janus.access` where `useJanus()` was given none, and a context narrowed
  to a user type the instance does not know;
- eight in `helpers.ts`: `requireUser()` — a field of another user type once
  narrowed, a user type the instance does not know — and `can()` — a
  permission the object's type does not declare, an object type the model
  does not, an object without a field a `fromField` reads, a condition reached
  with no `ctx`, a `ctx` of the wrong shape, and a context with no `access`;
- five in `plugin.ts`: `useJanus()` given a user type the instance does not
  know, something that is not what `janus()` answered, the `permissions()`
  instance as `auth`, and `applyJanusDirectives()` without `auth` or narrowed
  to a user type the instance does not know.

`plugin.ts` also holds this README's quick start, which must keep compiling.

## Licence

MIT
