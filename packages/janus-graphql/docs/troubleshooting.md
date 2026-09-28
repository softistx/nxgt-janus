# Troubleshooting `@nxgt/janus-graphql`

Each entry is headed by what you see: a compiler error, a `TypeError` at
start-up or in a response, a warning, or a code and its status. Search this page for its
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
- [`TypeError: applyJanusDirectives(): @permission on … needs the permissions() instance`](#typeerror-applyjanusdirectives-permission-on--needs-the-permissions-instance)
- [`TypeError: applyJanusDirectives(): @permission on … names the object type '…', which is not one of …`](#typeerror-applyjanusdirectives-permission-on--names-the-object-type--which-is-not-one-of-)
- [`TypeError: applyJanusDirectives(): @permission on … asks '…', which … does not declare`](#typeerror-applyjanusdirectives-permission-on--asks--which--does-not-declare)
- [`TypeError: applyJanusDirectives(): @permission on … reads its id from '…', which is not args.<name> or parent.<name>`](#typeerror-applyjanusdirectives-permission-on--reads-its-id-from--which-is-not-argsname-or-parentname)
- [`TypeError: applyJanusDirectives(): @permission on … reads args.…, and … takes no argument …`](#typeerror-applyjanusdirectives-permission-on--reads-args-and--takes-no-argument-)
- [`TypeError: applyJanusDirectives(): @permission on … reads the …'s id from …, and … reads '…' of the object itself (fromField)`](#typeerror-applyjanusdirectives-permission-on--reads-the-s-id-from--and--reads--of-the-object-itself-fromfield)
- [`TypeError: applyJanusDirectives(): @permission on … asks '…' of …, which reaches a when()`](#typeerror-applyjanusdirectives-permission-on--asks--of--which-reaches-a-when)
- [`TypeError: applyJanusDirectives(): @permission on … finds loaders.…, which is not a function`](#typeerror-applyjanusdirectives-permission-on--finds-loaders-which-is-not-a-function)
- [`Unknown directive "@authenticated"`, or `"@permission"`](#unknown-directive-authenticated-or-permission)
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
- [`@permission on … resolved no object id from … — answered NOT_FOUND`](#permission-on--resolved-no-object-id-from---answered-not_found)
- [`NOT_FOUND` where the user should be allowed](#not_found-where-the-user-should-be-allowed)
- [A 403 that tells a user the object exists](#a-403-that-tells-a-user-the-object-exists)
- [`Unexpected error.`, 500, on a field `@permission` guards](#unexpected-error-500-on-a-field-permission-guards)
- [`TypeError: @permission on …: ctx.janus.access is not set`](#typeerror-permission-on--ctxjanusaccess-is-not-set)
- [`TypeError: @permission on …: loaders.… answered …`](#typeerror-permission-on--loaders-answered-)
- [A 401 whose `data` still holds the other fields](#a-401-whose-data-still-holds-the-other-fields)

**Types**
- [`'user' is possibly 'null'`](#user-is-possibly-null)
- [`Property 'access' does not exist on type …`](#property-access-does-not-exist-on-type-)
- [`Expected 4 arguments, but got 3`, on `can()`](#expected-4-arguments-but-got-3-on-can)
- [`'…' does not exist in type 'Loaders<…>'`, or `'Conditions<…>'`](#-does-not-exist-in-type-loaders-or-conditions)
- [`Type '{ …: … }' is not assignable to type 'never'`, on `loaders`](#type-----is-not-assignable-to-type-never-on-loaders)

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

### `TypeError: applyJanusDirectives(): @permission on … needs the permissions() instance`

**When:** at start-up, for a schema that uses `@permission`.

**Why:** `useJanus()` — or `applyJanusDirectives()` — was given no `access`,
or something other than what `permissions()` answered: the directive reads
the object types and permissions from `access.model`.

**Fix:** `useJanus({ auth, access })`. An instance wrapped by
`instrumentPermissions()` keeps its `model`, and works as the plain one.

### `TypeError: applyJanusDirectives(): @permission on … names the object type '…', which is not one of …`

**Why:** `type:` names an object type the model does not declare — a typo, a
user type, or a type of another model. The message lists the model's.

**Fix:** name one of them: `@permission(name: "view", type: "record")`.

### `TypeError: applyJanusDirectives(): @permission on … asks '…', which … does not declare`

**Why:** `name:` is neither a relation nor a permission of that type — what
`access.can` would refuse too. The message lists what the type declares.

**Fix:** name one of them, or add the permission to the model:

```ts
record: { related: { owners: ['patient'] }, permits: { view: ['owners'], delete: ['owners'] } },
```

### `TypeError: applyJanusDirectives(): @permission on … reads its id from '…', which is not args.<name> or parent.<name>`

**Why:** `id:` is not a path: it must start with `args.` or `parent.`,
followed by one or more names — letters, numbers and `_`, not starting with a
number — separated by dots. `"id"`, `"args"`, `"record.id"` and
`"parent..id"` are not.

**Fix:** `id: "args.recordId"`, `id: "args.input.recordId"`,
`id: "parent.recordId"`.

### `TypeError: applyJanusDirectives(): @permission on … reads args.…, and … takes no argument …`

**Why:** the path's first name is not an argument of the field it guards.
Two common causes:

- the field names its argument otherwise — `record(recordId: ID!)` read
  through the default, `args.id`;
- the default is not what you meant: on a **field**, the default is
  `args.id` even when the field belongs to the object, and the message then
  ends with `— name the id with id: "parent.<field>" or id: "args.<name>"`;
  on a **type**, `id: "args.…"` must be an argument of every field of the
  type.

**Fix:** name the path: `@permission(name: "view", type: "record", id: "args.recordId")`,
or `id: "parent.id"` for the object a field belongs to.

### `TypeError: applyJanusDirectives(): @permission on … reads the …'s id from …, and … reads '…' of the object itself (fromField)`

**Why:** the type has a `fromField` relation, read from the object's own
data, and the directive has only an id — from `args`, or from a field of the
parent other than its `id`. `access.can` would have nothing to read the field
from.

**Fix:** give the type a loader, which answers the object for an id:

```ts
useJanus({ auth, access, loaders: { record: (id, ctx) => records.find(id) } });
```

Where the parent *is* the object — a type-level `@permission`, or
`id: "parent.id"` — no loader is needed: the parent is checked itself, and
must carry the field.

### `TypeError: applyJanusDirectives(): @permission on … asks '…' of …, which reaches a when()`

**Why:** the permission's rules reach a condition, whose `ctx` `access.can`
requires, and `useJanus()` has no `conditions` entry for the type to answer
it.

**Fix:**

```ts
useJanus({
	auth,
	access,
	conditions: { record: (record, ctx: Context) => ({ onShift: ctx.shift.open }) },
});
```

### `TypeError: applyJanusDirectives(): @permission on … finds loaders.…, which is not a function`

**Why:** a `loaders` entry is something else — the repository object rather
than a function of it, from JavaScript or past a cast.

**Fix:** `loaders: { record: (id) => records.find(id) }`.

### `Unknown directive "@authenticated"`, or `"@permission"`

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
only the field's. Or a `@permission(onDeny: FORBIDDEN)` denied: what
[`NOT_FOUND` where the user should be allowed](#not_found-where-the-user-should-be-allowed)
says applies to it too.

**Fix:** read the directives on the field, on its type, and on every
interface the type implements.

### `SERVICE_UNAVAILABLE`, 503, on every guarded field

**Why:** a store could not answer — `STORE_FAILED`. The sessions store for
`@authenticated`, `requireUser()` and `ctx.janus.user()`; the relation store
for `can()` and `@permission` — and a loader of yours that threw
`StoreFailure`. It is never answered `UNAUTHENTICATED` or `FORBIDDEN`.

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

### `@permission on … resolved no object id from … — answered NOT_FOUND`

**Where:** a warning, through `process.emitWarning` with the code
`JANUS_GRAPHQL_NO_OBJECT_ID`, once per directive; the client receives
`NOT_FOUND`, 404.

**Why:** the path read nothing it could check: an optional argument the
client left out (`record(id: ID)`), a `null` in the parent
(`parent.wardId` on a visit with no ward), an empty list in the parent, a
list holding a `null`, or a value that is neither a string nor an integer.
There is no object to ask about, so there is nothing to allow.

**Fix:** make the argument required — `record(id: ID!)` — or point `id:` at a
field that always holds an id. When a `null` is a valid answer, move the
directive to a field that is only reached when there is an object.

### `NOT_FOUND` where the user should be allowed

**Why:** one of the directives that apply denied — `NOT_FOUND` is
`@permission`'s default denial — or there was nothing to check:

- a `@permission` on the **type** or an **interface** it implements applies
  too, and is asked first;
- the `id:` path reads another object than you think — `args.id` is the
  default on a field, even a field of the object;
- a loader answered `null`;
- a `fromField` field is missing from the parent, so the relation it reads
  holds for nobody: the parent's resolver must answer the field;
- the user holds the relation on another object type than `type:` names.

**Fix:** ask `access.can` yourself with the same subject, permission and
object to see what the model answers, and read every directive on the field,
its type and its interfaces.

### A 403 that tells a user the object exists

**Why:** `onDeny: FORBIDDEN` answers *this exists, and not for you*. On
`record(id: "r42")`, that tells a user who may not know `r42` that it exists.

**Fix:** keep `NOT_FOUND`, the default, on anything reached by an id the
client chose. `FORBIDDEN` fits a field of an object the user may already
see — guard the type with a `NOT_FOUND` `@permission` and the field with the
`FORBIDDEN` one; the type's is asked first:

```graphql
type Record @permission(name: "view", type: "record") {
	billing: Billing @permission(name: "manage", type: "record", onDeny: FORBIDDEN)
}
```

### `Unexpected error.`, 500, on a field `@permission` guards

**Why:** `@permission` answers a `JanusError` — a relation store's
`STORE_FAILED`, or one a loader threw — with its status, 503 for an outage.
An error that is not a `JanusError` is masked by Yoga like any other: a
database driver's own error thrown by a loader or a condition, or anything
the resolver throws after the check. And without `janusMaskError()`, a
`JanusError` the **resolver** lets through is masked too.

**Fix:** throw `StoreFailure` from a loader whose database cannot answer, so
the outage is a 503 rather than a 500, and wire
`maskedErrors: { maskError: janusMaskError() }`:

```ts
import { StoreFailure } from '@nxgt/janus';

loaders: {
	record: (id) =>
		records.find(id).catch((cause: unknown) => {
			throw new StoreFailure('records.find could not answer', { cause });
		}),
},
```

### `TypeError: @permission on …: ctx.janus.access is not set`

**Why:** the schema was transformed with `access` — by
`applyJanusDirectives(schema, { auth, access })` — and is served with a
context built without it.

**Fix:** serve it through `useJanus({ auth, access })`, which builds both
from the same options.

### `TypeError: @permission on …: loaders.… answered …`

**Why:** a loader answered `undefined`, or something that is not an object.
**An absence is `null`**: a loader that forgets to `return` answers
`undefined`, and that is refused rather than read as "not found".

**Fix:** answer the object, or `null` when there is none.

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

### `'…' does not exist in type 'Loaders<…>'`, or `'Conditions<…>'`

**Why:** a `loaders` key is not an object type of the model; or a
`conditions` key is a type none of whose permissions reaches a `when()`, so
there is no `ctx` to answer.

**Fix:** name an object type of the model; drop the `conditions` entry of a
type with no condition.

### `Type '{ …: … }' is not assignable to type 'never'`, on `loaders`

**Why:** `useJanus()` was given `loaders` or `conditions` and no `access`:
without the permissions instance, `@permission` cannot be used, and has
nothing to load for.

**Fix:** `useJanus({ auth, access, loaders })`.
