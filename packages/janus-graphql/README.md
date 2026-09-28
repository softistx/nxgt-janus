# @nxgt/janus-graphql

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) in a GraphQL
server: the signed-in user on the context, authenticated only when a field
asks, fields and types guarded by `@authenticated`, `@fresh` and
`@permission`, and
every error answered with the status it deserves — an outage as 503, never
as 401, 403 or 404.

An [envelop](https://the-guild.dev/graphql/envelop) plugin, so it runs in
[GraphQL Yoga](https://the-guild.dev/graphql/yoga-server) and any server built
on envelop.

```ts
import { janusMaskError, janusTypeDefs, type JanusContext, useJanus } from '@nxgt/janus-graphql';
import { createSchema, createYoga, type YogaInitialContext } from 'graphql-yoga';
import { access } from './access'; // what permissions() answered
import { auth } from './auth'; // what janus() answered

type Context = YogaInitialContext & JanusContext<typeof auth, typeof access>;

const typeDefs = /* GraphQL */ `
	type Query {
		me: User @authenticated
		ward(id: ID!): Ward @permission(name: "enter", type: "ward")
	}
	type User { id: ID!, email: String }
	type Ward { id: ID!, name: String, roster: [String!] @authenticated(type: ["staff"]) }
`;

export const yoga = createYoga({
	schema: createSchema({
		typeDefs: [janusTypeDefs, typeDefs],
		resolvers: {
			Query: {
				me: async (_: unknown, __: unknown, ctx: Context) => ctx.janus.user(), // never null here
				ward: (_: unknown, { id }: { id: string }) => wards.find(id), // only for a user who may enter it
			},
		},
	}),
	plugins: [useJanus({ auth, access })],
	maskedErrors: { maskError: janusMaskError() }, // STORE_FAILED → 503, not "Unexpected error."
});
```

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-graphql @nxgt/janus graphql @graphql-tools/utils @envelop/core
bun add -d typescript        # 6
```

Every peer is required:

| Peer | Range | Why |
| --- | --- | --- |
| `@nxgt/janus` | the minor released beside it — `peerDependencies` states the range | A **peer**, never a dependency: this package defines no error class, so the `JanusError` a resolver throws is the one you import |
| `graphql` | `^16.9.0 \|\| ^17.0.0` | The schema and `GraphQLError` are yours; a second copy of `graphql` fails every schema |
| `@graphql-tools/utils` | `>=10.0.0 <13` | `mapSchema` and `getDirective`, which apply the directives |
| `@envelop/core` | `^5.0.0` | Types only — the `Plugin` `useJanus()` answers. Yoga already brings it |
| `typescript` | `^6.0.3` | As for `@nxgt/janus` |

The floors are tested, not claimed: the package's specs and its typecheck run
on `graphql` 16.9.0, `@graphql-tools/utils` 10.0.0 and `@envelop/core` 5.0.0
as well, together, with a single copy of `graphql`, in the Floors job, on
every CI run.

Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`: the
declarations import without extensions, so `nodenext` is not supported.

The SDL ships twice: `janusTypeDefs`, a string for `createSchema`, and
`graphql/janus.graphqls` in the package, for a code generator or an editor
that reads files — `node_modules/@nxgt/janus-graphql/graphql/janus.graphqls`.

## API

| Export | What it is |
| --- | --- |
| `useJanus({ auth, access?, type?, clock?, loaders?, conditions? })` | The envelop plugin. Adds `ctx.janus` to every request's context, and applies the directives to every schema the server is given, once. `type` treats a user of any other type as anonymous. `clock` is what `@fresh` and `requireFresh()` read — the one given to `janus()`, when it is not the system's. `loaders` and `conditions` are what `@permission` needs beside `access` |
| `ctx.janus.user()`, `ctx.janus.session()` | Who the request belongs to, and the session it presented — `null` for an anonymous request. `auth.authenticate(request)` runs the first time either is asked, once per request, and never when neither is |
| `ctx.janus.access` | The `permissions()` instance given to `useJanus()`. Absent from the type — and from the context — without one |
| `janusTypeDefs` | The SDL: `@authenticated`, `@fresh`, `@permission` and the `JanusPermissionDenial` enum — prefixed, so it never collides with a type of your schema. The same text as `graphql/janus.graphqls` |
| `@authenticated(type: [String!])` | On a field, a type or an interface. A signed-in user, of one of the `type`s when it names some. Anonymous: `UNAUTHENTICATED`. Another type: `FORBIDDEN`. Every one that applies — the field's, its type's, its interfaces' — must hold |
| `@fresh(maxAge: Int!)` | On a field, a type or an interface. A session that proved who it is less than `maxAge` **seconds** ago — signed in, or confirmed since by `auth.stepUp.confirm`. Anonymous: `UNAUTHENTICATED`. Older: `STEP_UP_REQUIRED`, 403. Checked after `@authenticated`, before `@permission`; the smallest `maxAge` that applies holds; on a subscription field, checked when it subscribes |
| `@permission(name, type, id, onDeny)` | On a field, a type or an interface. A user holding permission `name` on the object of `type` whose id `id` reads — `args.<path>` or `parent.<path>`; `args.id` on a field, `parent.id` on a type. A list requires it on every id. Repeated, every one must hold, in order. Denied: `NOT_FOUND`, or `FORBIDDEN` with `onDeny: FORBIDDEN` |
| `loaders: { [type]: (id, ctx) => object \| null }` | The object `@permission` checks for an id alone — from `args`, or a parent field other than `id` — required for a type with a `fromField`, whose fields `access.can` reads. `null` answers `NOT_FOUND` |
| `conditions: { [type]: (object, ctx) => ctx }` | The `ctx` `@permission` passes to `access.can` for a permission that reaches a `when()` |
| `applyJanusDirectives(schema, { auth, type?, access?, loaders?, conditions? })` | The schema transform alone — what `useJanus()` runs — to check a schema in a test or a build script. Throws a `TypeError` naming the field for a directive no request could pass. Its guards read `ctx.janus`, which only `useJanus()` builds |
| `requireUser(ctx, { type? })` | The signed-in user, narrowed to `type` — one or a non-empty list — or a denial: `UNAUTHENTICATED`, `FORBIDDEN` |
| `requireFresh(ctx, maxAge)` | The request's session, once it proved who it is less than `maxAge` ago — a duration with its unit, `'10m'`, never a bare number — or a denial: `UNAUTHENTICATED`, `STEP_UP_REQUIRED` |
| `can(ctx, permission, object, options?)` | `access.can` for the request's user, typed as `access.can` is. Anonymous answers `false`. Shares the request's checks with `@permission`: one question, one check per request |
| `janusMaskError(fallback?)` | Yoga's `maskedErrors.maskError`: a `JanusError` a resolver let through answered with its code and status; anything else to `fallback` |
| `janusGraphQLError(error)` | A `JanusError` as the `GraphQLError` the client reads: its code, its status, and only what the client can act on |
| `denial(code, message?)` | A denial of your own: `UNAUTHENTICATED` 401, `FORBIDDEN` 403, `NOT_FOUND` 404. For a stale session, call `requireFresh()`, whose `STEP_UP_REQUIRED` is `@nxgt/janus`'s |
| `JanusContext<typeof auth, typeof access?, Type?>` | What `useJanus()` adds to the context, for your resolvers' `ctx` |
| `JanusOptions`, `JanusOnContext`, `JanusDirectivesOptions`, `Loaders`, `Conditions`, `LoadedObject`, `RequireUserOptions`, `Auth`, `UserOfAuth`, `DenialCode`, `MaskError` | The types of the arguments and answers above |

## Directives

```graphql
type Query {
	me: User @authenticated                                        # any signed-in user
	record(id: ID!): Record @permission(name: "view", type: "record") # args.id
	records(ids: [ID!]!): [Record!]!
		@permission(name: "view", type: "record", id: "args.ids")     # every id
}

type Record @permission(name: "view", type: "record") {             # parent.id: the record itself
	title: String
	billing: Billing @permission(name: "manage", type: "record", onDeny: FORBIDDEN)
}

type Mutation {
	changeEmail(email: String!): User @fresh(maxAge: 600)            # signed in or stepped up < 10 min ago
}
```

```ts
useJanus({
	auth,
	access,
	loaders: { record: (id, ctx) => records.find(id) }, // record has a fromField: an id alone is not enough
	conditions: { record: (record, ctx: Context) => ({ onShift: ctx.shift.open }) }, // the ctx of a when() record's permissions reach
});
```

Each runs before the resolver, which a refused request never reaches.
`@fresh(maxAge)` takes **seconds**, and answers an older session
`STEP_UP_REQUIRED`: the client then runs `auth.stepUp.request` and
`confirm` — as two mutations, shown in
[the step-up guide](docs/guide/step-up.md) — and sends the request again.
Every `@authenticated` is checked first, then `@fresh`, then each
`@permission`, so a stale session asks no permission check.
`@permission` implies a signed-in user, and asks `access.can` with the parent
itself when the id is `parent.id`, with what `loaders[type]` answers for an
id of a type with a `fromField`, and with `{ type, id }` otherwise. Every
directive that applies must hold — the field's, its type's, its
interfaces' — asked outermost first, so a type's `NOT_FOUND` answers before
a field's `FORBIDDEN` could tell the object exists. The same question asked
twice in a request, by two fields or by a directive and `can()`, is one
check. What no request could pass — an object type or a permission the
model does not declare, a malformed `id:`, an argument the field does not
take, a missing loader or condition, a `maxAge` not above zero — is a
`TypeError` at start-up naming the field. Detail: [the directives guide](docs/guide/directives.md).

## Errors

This package defines **no error class**. A denial is a `GraphQLError`, and
every one carries a `code` and the HTTP status Yoga answers with:

```json
{ "errors": [{ "message": "Not signed in", "path": ["me"], "extensions": { "code": "UNAUTHENTICATED" } }] }
```

| Code | Status | When |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | An anonymous request reached a guarded field, `requireUser()` or `requireFresh()` |
| `FORBIDDEN` | 403 | A user of a type the directive or `requireUser()` does not name; a `@permission(onDeny: FORBIDDEN)` denied |
| `STEP_UP_REQUIRED` | 403 | A session older than `@fresh(maxAge)` or `requireFresh()` allows: ask for a step-up, then send the request again |
| `NOT_FOUND` | 404 | A `@permission` denied — its default — or a loader answered `null`; `denial('NOT_FOUND')` |
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
- **On a field, `@permission` reads `args.id` — even on a field of the
  object.** `type Record { notes: String @permission(name: "view", type:
  "record") }` is refused at start-up: `notes` takes no `id`. Write it on the
  type, whose default is `parent.id`, or say `id: "parent.id"`.
- **A `FORBIDDEN` tells the user the object exists.** Keep `NOT_FOUND`, the
  default, on anything reached by an id the client chose; use
  `onDeny: FORBIDDEN` on a field of an object the user may already see.
- **The parent must carry the fields its `fromField`s read.** A type-level
  `@permission` checks the parent itself, so a resolver answering
  `{ id, title }` for a record whose `doctors` read `doctorId` denies every
  doctor. Answer the field, or read the id from `args` with a loader.
- **A loader's own error is a 500.** `@permission` answers a `JanusError`
  with its status, but a driver's error thrown by a loader is masked like any
  other: throw `StoreFailure` for an outage, so it is a 503.
- **A request remembers its checks.** The same object, permission and user
  asked twice in one request is one check — so a mutation that grants or
  revokes, then asks again in the same request, reads the answer from
  before the change. Call `access.can` directly there. In a subscription,
  `@permission` asks afresh on every event; `can(ctx, …)` in its resolver
  reads the memo — call `ctx.janus.access.can` there.
- **`@permission` is not a filter.** A list of ids requires the permission
  on every one, and one denial denies the field; to answer only the items a
  user may see, ask `access.list()` for their ids.
- **A context built without a request cannot authenticate.** `ctx.janus.user()`
  rejects with a `TypeError` — a transport that is not HTTP, such as a
  WebSocket, needs its own wiring, which is on the [roadmap](docs/roadmap.md).
- **`@fresh` reads seconds; `requireFresh()` a duration.** `@fresh(maxAge:
  10)` is ten seconds, not ten minutes — write `600`. `requireFresh(ctx,
  '10m')` takes the unit, and refuses a bare number, which `@nxgt/janus`
  would read as milliseconds.
- **`useJanus()` reads the system clock unless given `janus()`'s.** With
  `janus({ clock: fixedClock(…) })` in a spec and no `useJanus({ clock })`,
  every session looks as old as the fixed date, and every `@fresh` field
  answers `STEP_UP_REQUIRED`. Pass the same clock to both.
- **A subscription field's `@fresh` is checked when it subscribes.** Its
  events keep coming past `maxAge`; that `@fresh` is not asked again on
  each one, as `@permission` is. A `@fresh` on the payload's type or its
  fields is asked on every event, like any field.
- **A denial of a list field's item fails the whole list** where the item is
  non-null (`[Doctor!]!`), as GraphQL's null propagation always does. Guard
  the list field, or make the item nullable.

## Documentation

- [Guides](docs/README.md) — the directives, the step-up over GraphQL, the context and the lazy user, errors as statuses, telemetry, and federation
- [Troubleshooting](docs/troubleshooting.md) — by the message or status you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Twenty-nine plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/`:

- five in `context.ts`: reading the user or the session where either may be
  `null` (twice), a field of another user type once `JanusContext` is narrowed,
  `ctx.janus.access` where `useJanus()` was given none, and a context narrowed
  to a user type the instance does not know;
- nine in `helpers.ts`: `requireUser()` — a field of another user type once
  narrowed, a user type the instance does not know, an empty list of user
  types — and `can()` — a
  permission the object's type does not declare, an object type the model
  does not, an object without a field a `fromField` reads, a condition reached
  with no `ctx`, a `ctx` of the wrong shape, and a context with no `access`;
- five in `plugin.ts`: `useJanus()` given a user type the instance does not
  know, something that is not what `janus()` answered, the `permissions()`
  instance as `auth`, and `applyJanusDirectives()` without `auth` or narrowed
  to a user type the instance does not know;
- five in `wiring.ts`: `useJanus()`'s `loaders` for an object type the model
  does not declare, a loader answering an object without a field a
  `fromField` reads, `conditions` for a type no `when()` is reached on, a
  condition answering a `ctx` of the wrong shape, and `loaders` without
  `access`;
- five in `fresh.ts`: `requireFresh()` given a bare number, a duration
  written as prose, no `maxAge` at all, or the request instead of the
  context, and `useJanus()` given a timestamp as its `clock`.

`plugin.ts` also holds this README's quick start, which must keep compiling.

## Licence

MIT
