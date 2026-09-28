# Troubleshooting `@nxgt/janus-graphql`

Each entry is headed by what you see: a compiler error, a `TypeError` at
start-up or in a response, or a code and its status. Search this page for its
words.

This package **defines no error class**. A denial is a `GraphQLError`; any
other code is one of `@nxgt/janus`'s — see
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md)
for what causes each.

## Index

**At start-up**
- [`TypeError: applyJanusDirectives(): @authenticated on … names the user type '…', which is not one of …`](#typeerror-applyjanusdirectives-authenticated-on--names-the-user-type--which-is-not-one-of-)
- [`TypeError: applyJanusDirectives(): @authenticated on … names no user type`](#typeerror-applyjanusdirectives-authenticated-on--names-no-user-type)
- [`TypeError: applyJanusDirectives(): the @authenticated on … admit no user type in common`](#typeerror-applyjanusdirectives-the-authenticated-on--admit-no-user-type-in-common)
- [`TypeError: applyJanusDirectives(): @permission on … is not enforced yet`](#typeerror-applyjanusdirectives-permission-on--is-not-enforced-yet)
- [`Unknown directive "@authenticated"`](#unknown-directive-authenticated)
- [`TypeError: applyJanusDirectives(): type '…' is not a user type of auth`](#typeerror-applyjanusdirectives-type--is-not-a-user-type-of-auth)
- [`TypeError: useJanus(): auth is not what janus() answered`](#typeerror-usejanus-auth-is-not-what-janus-answered)

**In a response**
- [`UNAUTHENTICATED` for a signed-in user](#unauthenticated-for-a-signed-in-user)
- [`FORBIDDEN` where the user should be allowed](#forbidden-where-the-user-should-be-allowed)
- [`SERVICE_UNAVAILABLE`, 503, on every guarded field](#service_unavailable-503-on-every-guarded-field)
- [`Unexpected error.`, 500, where a `JanusError` was thrown](#unexpected-error-500-where-a-januserror-was-thrown)
- [`TypeError: … ctx.janus is not set`](#typeerror--ctxjanus-is-not-set)
- [`TypeError: useJanus(): the GraphQL context has no request to authenticate`](#typeerror-usejanus-the-graphql-context-has-no-request-to-authenticate)
- [`TypeError: can(): ctx.janus.access is not set`](#typeerror-can-ctxjanusaccess-is-not-set)
- [A 401 whose `data` still holds the other fields](#a-401-whose-data-still-holds-the-other-fields)

**Types**
- [`'user' is possibly 'null'`](#user-is-possibly-null)
- [`Property 'access' does not exist on type …`](#property-access-does-not-exist-on-type-)
- [`Expected 4 arguments, but got 3`, on `can()`](#expected-4-arguments-but-got-3-on-can)

## At start-up

### `TypeError: applyJanusDirectives(): @authenticated on … names the user type '…', which is not one of …`

**When:** the server builds its schema — `createYoga()` with `useJanus()`, or
`applyJanusDirectives()` called yourself.

**Why:** a `type:` names a user type `janus()` does not declare — a typo, or a
type of another instance. Under `useJanus({ type: 'staff' })`, `'staff'` is
the only one a directive may name. `(read by Ward.name)` says the directive is
on the type `Ward`, read for its field `name`.

**Fix:** name a user type of `auth.types`.

```graphql
type Query {
	roster: [Staff!]! @authenticated(type: ["staff"]) # not "doctor"
}
```

### `TypeError: applyJanusDirectives(): @authenticated on … names no user type`

**Why:** `@authenticated(type: [])` admits nobody, so every request would be
refused.

**Fix:** leave `type:` out to admit any signed-in user —
`@authenticated` — or name the user types.

### `TypeError: applyJanusDirectives(): the @authenticated on … admit no user type in common`

**Why:** every `@authenticated` that applies must hold — the field's, its
type's, its interfaces' — and their `type:` lists share no user type.

```graphql
type Ward @authenticated(type: ["staff"]) {
	chart: String @authenticated(type: ["patient"]) # staff AND patient: nobody
}
```

**Fix:** widen one of them, or move the field to a type whose directive
admits the users it is for.

### `TypeError: applyJanusDirectives(): @permission on … is not enforced yet`

**Why:** `@permission` is declared in `janusTypeDefs`, and not enforced by
this version. A directive that let the field through would be worse than
none, so a schema using it does not start.

**Fix:** remove it, and check the permission in the resolver until it lands:

```ts
record: async (_: unknown, { id }: { id: string }, ctx: Context) => {
	const record = await records.find(id);
	if (record === null || !(await can(ctx, 'view', { type: 'record', ...record }))) return null;
	return record;
},
```

### `Unknown directive "@authenticated"`

**Why:** graphql-js builds the schema before `useJanus()` sees it, and the
directive is not declared.

**Fix:** put `janusTypeDefs` among the type definitions:
`createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers })`. A code
generator reading files takes
`node_modules/@nxgt/janus-graphql/graphql/janus.graphqls`.

### `TypeError: applyJanusDirectives(): type '…' is not a user type of auth`

**When:** at start-up, with `useJanus({ auth, type })` or
`applyJanusDirectives(schema, { auth, type })` — from JavaScript, or with a
`type` cast past the compiler, which otherwise refuses it.

**Why:** `type` names a user type `janus()` does not declare. The message
lists the ones it does: `— it knows 'patient', 'staff'`.

**Fix:** name one of `auth.types`: `useJanus({ auth, type: 'staff' })`.

### `TypeError: useJanus(): auth is not what janus() answered`

**Why:** `auth` has no `authenticate` — the `permissions()` instance passed in
its place, or the module that exports `auth` not loaded yet.

**Fix:** `useJanus({ auth, access })`, with `auth` what `janus()` answered.

## In a response

### `UNAUTHENTICATED` for a signed-in user

**Why:** `authenticate` found no session in the request. The usual causes: the
client sends the cookie to another origin without `credentials: 'include'`;
the token is in a header `authenticate` does not read; the session lapsed or
was revoked; or `useJanus({ type })` treats this user's type as anonymous.

**Fix:** send `Authorization: Bearer <token>`, `X-Session-Token`, or the
session cookie; check `useJanus()`'s `type`.

### `FORBIDDEN` where the user should be allowed

**Why:** a `type:` that applies does not name the user's type. Every
`@authenticated` that applies must hold — a type's or an interface's too, not
only the field's.

**Fix:** read the directives on the field, on its type, and on every
interface the type implements.

### `SERVICE_UNAVAILABLE`, 503, on every guarded field

**Why:** a store could not answer — `STORE_FAILED`. The sessions store for
`@authenticated`, `requireUser()` and `ctx.janus.user()`; the relation store
for `can()`. It is never answered `UNAUTHENTICATED` or `FORBIDDEN`.

**Fix:** the store: its connection, its credentials, its availability. The
message carries nothing of the store's; log the error where you call
`auth` — `@nxgt/janus`'s `slot` and `operation` name the call that failed.

### `Unexpected error.`, 500, where a `JanusError` was thrown

**Why:** Yoga masks every error that is not a `GraphQLError`, and nothing
told it a `JanusError` is one a client should see.

**Fix:** `maskedErrors: { maskError: janusMaskError() }`. `CREDENTIALS_INVALID`
is then 401, `STORE_FAILED` 503, and so on.

### `TypeError: … ctx.janus is not set`

**Why:** a guarded field, `requireUser()` or `can()` ran under a context
`useJanus()` did not build: the plugin is missing, or the schema was
transformed with `applyJanusDirectives()` and served by something else.

**Fix:** `plugins: [useJanus({ auth })]`.

### `TypeError: useJanus(): the GraphQL context has no request to authenticate`

**Why:** the context was built without `request` — a transport that is not
HTTP, such as a WebSocket subscription.

**Fix:** for now, authenticate subscriptions over HTTP (Yoga's server-sent
events carry the request). A connection-level wiring for graphql-ws is on
the [roadmap](roadmap.md).

### `TypeError: can(): ctx.janus.access is not set`

**Why:** `useJanus()` was given no `access`.

**Fix:** `useJanus({ auth, access })`, with `access` what `permissions()`
answered.

### A 401 whose `data` still holds the other fields

**Why:** Yoga answers the highest status among the errors. One refused field
in a query makes the response a 401, while the fields that were allowed are
answered in `data`.

**Fix:** nothing to fix: read `data` and `errors` rather than the status
alone, or split the query.

## Types

### `'user' is possibly 'null'`

**When:** `const user = await ctx.janus.user(); user.id;` — or, read without
binding it, `(await ctx.janus.user()).id`, where the message is
`Object is possibly 'null'`.

**Why:** `ctx.janus.user()` answers `null` for an anonymous request, and the
type does not know a directive guards the field.

**Fix:** `requireUser(ctx)`, which answers a user or refuses the request.

```ts
const user = await requireUser(ctx);
user.id;
```

### `Property 'access' does not exist on type …`

**Why:** the context was typed `JanusContext<typeof auth>`, without `access`
— as it is when `useJanus()` is given none.

**Fix:** `JanusContext<typeof auth, typeof access>`, and `useJanus({ auth, access })`.

### `Expected 4 arguments, but got 3`, on `can()`

**Why:** the permission reaches a condition, a `when()` in the model, and its
`ctx` is required — as it is for `access.can`.

**Fix:** pass it: `can(ctx, 'edit', record, { ctx: { locked: record.locked } })`.
