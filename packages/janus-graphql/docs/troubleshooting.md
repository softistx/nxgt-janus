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
- [`TypeError: applyJanusDirectives(): @fresh on … asks maxAge: …`](#typeerror-applyjanusdirectives-fresh-on--asks-maxage-)
- [`TypeError: applyJanusDirectives(): @permission on … needs the permissions() instance`](#typeerror-applyjanusdirectives-permission-on--needs-the-permissions-instance)
- [`TypeError: applyJanusDirectives(): @permission on … names the object type '…', which is not one of …`](#typeerror-applyjanusdirectives-permission-on--names-the-object-type--which-is-not-one-of-)
- [`TypeError: applyJanusDirectives(): @permission on … asks '…', which … does not declare`](#typeerror-applyjanusdirectives-permission-on--asks--which--does-not-declare)
- [`TypeError: applyJanusDirectives(): @permission on … reads its id from '…', which is not args.<name> or parent.<name>`](#typeerror-applyjanusdirectives-permission-on--reads-its-id-from--which-is-not-argsname-or-parentname)
- [`TypeError: applyJanusDirectives(): @permission on … reads args.…, and … takes no argument …`](#typeerror-applyjanusdirectives-permission-on--reads-args-and--takes-no-argument-)
- [`TypeError: applyJanusDirectives(): @permission on … reads the …'s id from …, and … reads '…' of the object itself (fromField)`](#typeerror-applyjanusdirectives-permission-on--reads-the-s-id-from--and--reads--of-the-object-itself-fromfield)
- [`TypeError: applyJanusDirectives(): @permission on … asks '…' of …, which reaches a when()`](#typeerror-applyjanusdirectives-permission-on--asks--of--which-reaches-a-when)
- [`TypeError: applyJanusDirectives(): @permission on … finds loaders.…, which is not a function`](#typeerror-applyjanusdirectives-permission-on--finds-loaders-which-is-not-a-function)
- [`Unknown directive "@authenticated"`, `"@fresh"` or `"@permission"`](#unknown-directive-authenticated-fresh-or-permission)
- [`Argument "@fresh(maxAge:)" of type "Int!" is required`, or `Argument "maxAge" has invalid value …`](#argument-freshmaxage-of-type-int-is-required-or-argument-maxage-has-invalid-value-)
- [`TypeError: applyJanusDirectives(): type '…' is not a user type of auth`](#typeerror-applyjanusdirectives-type--is-not-a-user-type-of-auth)
- [`TypeError: useJanus(): auth is not what janus() answered`](#typeerror-usejanus-auth-is-not-what-janus-answered)
- [`TypeError: useJanus(): access is not what permissions() answered`](#typeerror-usejanus-access-is-not-what-permissions-answered)
- [`TypeError: useJanus(): clock is not a Clock`](#typeerror-usejanus-clock-is-not-a-clock)
- [`TypeError: janusConnection(): auth is not what janus() answered`, `access …`, `clock …`](#typeerror-janusconnection-auth-is-not-what-janus-answered-access--clock-)
- [`TypeError: janusConnection(): upgrade is not a function`](#typeerror-janusconnection-upgrade-is-not-a-function)

**Over graphql-ws**
- [The socket closed `4403: Forbidden` right after connecting](#the-socket-closed-4403-forbidden-right-after-connecting)
- [The socket closed `4500`](#the-socket-closed-4500)
- [A stream keeps its events after its session was revoked](#a-stream-keeps-its-events-after-its-session-was-revoked)
- [`TypeError: janusConnection(): the connection's extra is not an object`](#typeerror-janusconnection-the-connections-extra-is-not-an-object)

**In a response**
- [`UNAUTHENTICATED` for a signed-in user](#unauthenticated-for-a-signed-in-user)
- [`MAIL_THROTTLED`, 429, `Too many requests, retry later`](#mail_throttled-429-too-many-requests-retry-later)
- [`CREDENTIALS_INVALID` with `retryAfter`, 401, for the right password](#credentials_invalid-with-retryafter-401-for-the-right-password)
- [`FORBIDDEN` where the user should be allowed](#forbidden-where-the-user-should-be-allowed)
- [`STEP_UP_REQUIRED`, 403](#step_up_required-403)
- [`STEP_UP_REQUIRED` for a user who just signed in](#step_up_required-for-a-user-who-just-signed-in)
- [`SERVICE_UNAVAILABLE`, 503, on every guarded field](#service_unavailable-503-on-every-guarded-field)
- [`Unexpected error.`, 500, where a `JanusError` was thrown](#unexpected-error-500-where-a-januserror-was-thrown)
- [`TypeError: … ctx.janus is not set`](#typeerror--ctxjanus-is-not-set)
- [`TypeError: …: the GraphQL context has no request to authenticate`](#typeerror--the-graphql-context-has-no-request-to-authenticate)
- [`TypeError: can(): ctx.janus.access is not set`](#typeerror-can-ctxjanusaccess-is-not-set)
- [`TypeError: requireUser(): type is an empty list, which no user could pass`](#typeerror-requireuser-type-is-an-empty-list-which-no-user-could-pass)
- [`TypeError: requireFresh(): maxAge is a duration with its unit`](#typeerror-requirefresh-maxage-is-a-duration-with-its-unit)
- [`TypeError: requireFresh(): maxAge: "…" is not a duration`](#typeerror-requirefresh-maxage--is-not-a-duration)
- [`TypeError: requireFresh(): maxAge: a duration must be above zero`](#typeerror-requirefresh-maxage-a-duration-must-be-above-zero)
- [`@permission on … resolved no object id from … — answered NOT_FOUND`](#permission-on--resolved-no-object-id-from---answered-not_found)
- [`NOT_FOUND` where the user should be allowed](#not_found-where-the-user-should-be-allowed)
- [A 403 that tells a user the object exists](#a-403-that-tells-a-user-the-object-exists)
- [`Unexpected error.`, 500, on a field `@permission` guards](#unexpected-error-500-on-a-field-permission-guards)
- [`TypeError: @permission on …: ctx.janus.access is not set`](#typeerror-permission-on--ctxjanusaccess-is-not-set)
- [`TypeError: @permission on …: loaders.… answered …`](#typeerror-permission-on--loaders-answered-)
- [The session cookie expires while the user is active](#the-session-cookie-expires-while-the-user-is-active)
- [`Warning: janusMaskError: report failed on …`](#warning-janusmaskerror-report-failed-on-)
- [A 401 whose `data` still holds the other fields](#a-401-whose-data-still-holds-the-other-fields)

**Types**
- [`'user' is possibly 'null'`](#user-is-possibly-null)
- [`Property 'access' does not exist on type …`](#property-access-does-not-exist-on-type-)
- [`Expected 4 arguments, but got 3`, on `can()`](#expected-4-arguments-but-got-3-on-can)
- [`'…' does not exist in type 'Loaders<…>'`, or `'Conditions<…>'`](#-does-not-exist-in-type-loaders-or-conditions)
- [`Type '{ …: … }' is not assignable to type 'never'`, on `loaders`](#type-----is-not-assignable-to-type-never-on-loaders)
- [`Source has 0 element(s) but target requires 1`, on `requireUser()`](#source-has-0-elements-but-target-requires-1-on-requireuser)
- [`Argument of type '600' is not assignable to parameter of type '`${number}ms` | …'`, on `requireFresh()`](#argument-of-type-600-is-not-assignable-to-parameter-of-type-numberms---on-requirefresh)
- [`Expected 2 arguments, but got 1`, on `requireFresh()`](#expected-2-arguments-but-got-1-on-requirefresh)
- [`Type 'number' is not assignable to type 'Clock'`](#type-number-is-not-assignable-to-type-clock)

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

### `TypeError: applyJanusDirectives(): @fresh on … asks maxAge: …`

**When:** at start-up, for a schema that uses `@fresh`.

**Why:** `maxAge` is not above zero — `@fresh(maxAge: 0)` or a negative
number — so no session could ever be fresh enough, and every request would
be refused. The message names the field, and the location the directive was
written on when it is not the field: `@fresh on Account (read by
Account.email)`.

**Fix:** write a number of **seconds** above zero:

```graphql
type Mutation {
	changeEmail(email: String!): User @fresh(maxAge: 600) # ten minutes
}
```

### `TypeError: applyJanusDirectives(): @permission on … needs the permissions() instance`

**When:** at start-up, for a schema that uses `@permission`.

**Why:** `useJanus()` — or `applyJanusDirectives()` — was given no `access`,
or, through `applyJanusDirectives()`, an object with no `model`: the
directive reads the object types and permissions from `access.model`.
(`useJanus()` refuses an `access` without `can` earlier — see
[`access is not what permissions() answered`](#typeerror-usejanus-access-is-not-what-permissions-answered).)

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

### `Unknown directive "@authenticated"`, `"@fresh"` or `"@permission"`

**Why:** graphql-js builds the schema before `useJanus()` sees it, and the
directive is not declared.

**Fix:** put `janusTypeDefs` among the type definitions:
`createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers })`. A code
generator reading files takes
`node_modules/@nxgt/janus-graphql/graphql/janus.graphqls`.

### `Argument "@fresh(maxAge:)" of type "Int!" is required`, or `Argument "maxAge" has invalid value …`

graphql 16 words the first `Directive "@fresh" argument "maxAge" of type
"Int!" is required, but it was not provided.`

**Why:** graphql-js refuses the directive at start-up: `@fresh` without
`maxAge`, when the schema is built; or with a value that is not an `Int` —
a fraction, a string such as `"10m"` — when `useJanus()` reads it.

**Fix:** a whole number of seconds: `@fresh(maxAge: 600)`. A duration with a
unit belongs to `requireFresh(ctx, '10m')`, in a resolver.

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

### `TypeError: useJanus(): access is not what permissions() answered`

**Why:** `access` has no `can` — `janus()`'s instance passed in its place,
`null`, or the module that exports `access` not loaded yet.

**Fix:** `useJanus({ auth, access })`, with `access` what `permissions()`
answered — or leave `access` out when no field uses `@permission` or `can()`.

### `TypeError: useJanus(): clock is not a Clock`

**Why:** `clock` has no `now()` — a timestamp such as `Date.now()`, or a
`Date`, passed from JavaScript or cast past the compiler.

**Fix:** pass the clock given to `janus()` — `fixedClock(…)` from
`@nxgt/janus` in a spec — or leave `clock` out for the system's:
`useJanus({ auth, clock })`.

### `TypeError: janusConnection(): auth is not what janus() answered`, `access …`, `clock …`

**Why:** the same checks as `useJanus()`'s, named for `janusConnection()`:
`auth` is not what `janus()` answered, `access` not what `permissions()`
answered, `clock` not a `Clock`.

**Fix:** `janusConnection({ auth })`, with the `access` and `clock` given to
`useJanus()` when you pass them at all.

### `TypeError: janusConnection(): upgrade is not a function`

**Why:** `upgrade` is how `onConnect` finds the upgrade request on a
transport whose `extra` does not carry it, and it was given something else.

**Fix:** a function of graphql-ws's context, or nothing — `ctx.extra.request`
is then read, as `graphql-ws/use/ws` sets it:

```ts
janusConnection({ auth, upgrade: (ctx: { readonly extra: { readonly socket: Upgraded } }) => ctx.extra.socket.data.request });
```

## Over graphql-ws

### The socket closed `4403: Forbidden` right after connecting

**Why:** `onConnect` found no credential that authenticates: none at all,
an unknown or lapsed token, a user gone or inactive, a user of another
type than `janusConnection({ type })`, or a `connectionParams.authorization`
that is not a string. A `Bearer` `connectionParams.authorization` is
read before the upgrade request, and **the first present wins**: a lapsed
token there refuses the connection even beside a live cookie. One of
another scheme (`Basic …`) does not count, and the cookie is read.

**Fix:** send `connectionParams: { authorization: 'Bearer <token>' }` —
the key lower-case — or connect from a browser holding the session cookie,
to the origin that set it. On Bun, pass `upgrade`, or the cookie is never
read. graphql-ws's client retries a `4403`; a `connectionParams` function
is asked again each time.

### The socket closed `4500`

**Why:** the sessions store could not answer while `onConnect`
authenticated — `STORE_FAILED`. `graphql-ws/use/ws` closes the socket
`4500` and logs the error with `console.error`. It is an outage, **never a
refusal**: `4403` would tell the client its session is bad.

**Fix:** the store. graphql-ws's client does not retry a `4500` by default;
set `shouldRetry` to retry an outage.

### A stream keeps its events after its session was revoked

**Why:** an operation is authenticated once, when it subscribes, and
each event's `@authenticated` reads that answer. The next operation on
the connection is refused `UNAUTHENTICATED`, and a reconnection `4403`.

**Fix:** close the session's sockets when you revoke it
([the subscriptions guide](guide/subscriptions.md#a-session-revoked-while-connected)).
A permission revoked needs nothing: `@permission` asks again on every event.

### `TypeError: janusConnection(): the connection's extra is not an object`

**Why:** `onConnect` was called with a context whose `extra` is not an
object — by hand, or by a transport of your own. It remembers the
connection by that object.

**Fix:** pass `onConnect` to graphql-ws's `useServer()` or `makeHandler()`,
which give it the context they made.

## In a response

### `UNAUTHENTICATED` for a signed-in user

**Why:** `authenticate` found no session in the request. The usual causes: the
client sends the cookie to another origin without `credentials: 'include'`;
the token is in a header `authenticate` does not read; the session lapsed or
was revoked; or `useJanus({ type })` treats this user's type as anonymous.

**Fix:** send `Authorization: Bearer <token>`, `X-Session-Token`, or the
session cookie; check `useJanus()`'s `type`.

### `MAIL_THROTTLED`, 429, `Too many requests, retry later`

With `extensions.retryAfter` and a `Retry-After` header.

**Why:** `@nxgt/janus` throttles the requests that hand out something to
e-mail, on by default: past five for one address (one user, for
`verifyEmail.send` and an e-mailed `stepUp.request`) in a 10-minute window it
throws `MAIL_THROTTLED` and issues nothing: a refused request spends and
rotates nothing, and the last link or code sent still works. An unknown address is counted and
refused alike. `retryAfter` is the seconds until the window ends.

**Fix:** read `extensions.retryAfter` in the client and tell the visitor to use
the last e-mail they received (it still works), or to wait that many seconds.
`@nxgt/janus` never sees IP addresses: add a per-IP ceiling with `@nxgt/redis`
rate limits. To change
the limit, `janus({ mail: { throttle: { attempts, window } } })`; in a test
over a `fixedClock`, advance the clock past `retryAfter`, or wire
`mail: { throttle: false }`.

### `CREDENTIALS_INVALID` with `retryAfter`, 401, for the right password

With `extensions.retryAfter` and a `Retry-After` header.

**Why:** `@nxgt/janus` throttles password guessing per login, on by default:
past ten passwords at one login in a 15-minute window, `signIn` refuses every
one — the right password included — until the window ends. `retryAfter` is
the seconds until then. Nothing locks.

**Fix:** show the wait, not "wrong password": read `extensions.retryAfter`
in the client. To change the limit, `janus({ signIn: { throttle: { attempts,
window } } })`; in a test over a `fixedClock`, advance the clock past
`retryAfter`, or wire `signIn: { throttle: false }`.

### `FORBIDDEN` where the user should be allowed

**Why:** a `type:` that applies does not name the user's type. Every
`@authenticated` that applies must hold — a type's or an interface's too, not
only the field's. Or a `@permission(onDeny: FORBIDDEN)` denied: what
[`NOT_FOUND` where the user should be allowed](#not_found-where-the-user-should-be-allowed)
says applies to it too.

**Fix:** read the directives on the field, on its type, and on every
interface the type implements.

### `STEP_UP_REQUIRED`, 403

**Why:** a field `@fresh(maxAge)` guards, or a `requireFresh(ctx, maxAge)`,
was reached by a session that proved who it is `maxAge` ago or more — at
its sign-in, or at its last `auth.stepUp.confirm`. Renewing a sliding
session does not count. This is the answer working: it tells the client to
ask for a step-up.

**Fix:** in the client, on `extensions.code === 'STEP_UP_REQUIRED'`, run the
step-up — `requestStepUp`, then `confirmStepUp(challenge, code)` — and send
the request again. The mutations are in
[the step-up over GraphQL](guide/step-up.md).

### `STEP_UP_REQUIRED` for a user who just signed in

**Why:** `@fresh` reads the time from `useJanus({ clock })`, and the session
was stamped with `janus()`'s. Two different clocks: `janus({ clock:
fixedClock(…) })` with `useJanus()` given none, in a spec — the session looks
days old. Or `maxAge` written as minutes: `@fresh(maxAge: 10)` is ten
seconds, not ten minutes.

**Fix:** give both the same clock — `useJanus({ auth, clock })` — and write
`maxAge` in seconds: `@fresh(maxAge: 600)` for ten minutes.

### `SERVICE_UNAVAILABLE`, 503, on every guarded field

**Why:** a store could not answer — `STORE_FAILED`. The sessions store for
`@authenticated`, `@fresh`, `requireUser()`, `requireFresh()` and
`ctx.janus.user()`; the relation store
for `can()` and `@permission` — and a loader of yours that threw
`StoreFailure`. It is never answered `UNAUTHENTICATED`, `FORBIDDEN` or `STEP_UP_REQUIRED`.

**Fix:** the store: its connection, its credentials, its availability. The
message carries nothing of the store's, and a directive or a helper answers
the outage before any resolver of yours could catch it: pass `report` to
the mask, which is given `@nxgt/janus`'s error — its `slot` and `operation`
name the call that failed, its `cause` the driver's error:

```ts
maskedErrors: {
	maskError: janusMaskError({ report: (error) => logger.error(error), fallback: maskError }),
},
```

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

### `TypeError: …: the GraphQL context has no request to authenticate`

**Why:** the context was built without `request`, and for no connection
`janusConnection().onConnect` accepted: a transport that is not HTTP; a
graphql-ws server without `onConnect`; or Yoga's recipe with the context
built from something other than `{ ...ctx, … }`, which drops `ctx.extra`,
where `useJanus()` finds the connection. The message opens with
`useJanus():` under Yoga, and with `janusConnection().context:` without
it — the `context` of a server whose `onConnect` is not
`janusConnection()`'s.

**Fix:** over graphql-ws, pass `onConnect: janusConnection({ auth }).onConnect`
to `useServer()`, and keep the `...ctx` spread in `yoga.getEnveloped()`
([the subscriptions guide](guide/subscriptions.md)). Without Yoga, pass
`context: connection.context` too.

### `TypeError: can(): ctx.janus.access is not set`

**Why:** `useJanus()` was given no `access`.

**Fix:** `useJanus({ auth, access })`, with `access` what `permissions()`
answered.

### `TypeError: requireUser(): type is an empty list, which no user could pass`

**Why:** `requireUser(ctx, { type })` was given `[]` — a list of user types
built at run time that came out empty. The compiler refuses a literal `[]`;
a `string[]` built elsewhere gets through, and no user could pass it.

**Fix:** name at least one user type, or leave `type` out to admit any
signed-in user:

```ts
const user = await requireUser(ctx, allowed.length > 0 ? { type: allowed } : {});
```

### `TypeError: requireFresh(): maxAge is a duration with its unit`

**Why:** `requireFresh(ctx, 600)` — a bare number, from JavaScript or built
at run time. `@nxgt/janus` would read it as 600 milliseconds, where
`@fresh(maxAge: 600)` reads ten minutes, so it is refused rather than
guessed. The compiler refuses a literal number.

**Fix:** write the unit: `requireFresh(ctx, '10m')`, or `'600s'`.

### `TypeError: requireFresh(): maxAge: "…" is not a duration`

**Why:** the string is not a number followed by `ms`, `s`, `m`, `h` or `d`
— `'10 minutes'`, `'10 m'`.

**Fix:** `requireFresh(ctx, '10m')`.

### `TypeError: requireFresh(): maxAge: a duration must be above zero`

**Why:** `requireFresh(ctx, '0m')` — no session is ever fresh within no
time, so every request would be refused. The compiler lets it through: the
type reads a number and a unit, not their value.

**Fix:** a duration above zero, `requireFresh(ctx, '10m')`.

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

### The session cookie expires while the user is active

**Why:** `authenticate` renewed the session in the store, and no
`Set-Cookie` carried the new expiry back, so the browser drops the cookie at
the expiry it was given at sign-in. `useJanus()` sends it only on Yoga's
HTTP response (`onResponse`), and not when:

- the server runs on envelop without Yoga, which never calls `onResponse`;
- the `auth` given to `useJanus()` is a wrapper of yours without `cookie`;
- the only traffic is over graphql-ws, which has no response to carry it;
- the client sent `Authorization: Bearer` or `X-Session-Token`, which is
  never answered with a cookie.

**Fix:** under Yoga, pass `janus()`'s own instance, or a wrapper with
`cookie: auth.cookie`. Elsewhere — and for a browser that talks only over
the WebSocket — renew through an HTTP route of yours that sends
`auth.cookie.serialize(token, session)`, as `@nxgt/janus-hono`'s
`session()` does.

### `Warning: janusMaskError: report failed on …`

**Why:** the `report` given to `janusMaskError()` threw, or rejected — a
logger that is down, a serializer that meets a circular `cause`. The name
after the code is the class of what it threw.

**Fix:** your `report`. The response was sent all the same: a `report`
never changes the answer, so an outage is still a 503 and never a 500.

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

### `Source has 0 element(s) but target requires 1`, on `requireUser()`

The full message reads `Type '[]' is not assignable to type '"patient" |
"staff" | readonly ["patient" | "staff", ...("patient" | "staff")[]] |
undefined'`.

**Why:** `requireUser(ctx, { type: [] })` — an empty list admits no user.
The compiler refuses it here; a list built at run time that comes out empty
throws
[`TypeError: requireUser(): type is an empty list, which no user could pass`](#typeerror-requireuser-type-is-an-empty-list-which-no-user-could-pass).

**Fix:** name at least one user type, `{ type: ['staff'] }`, or leave `type`
out to admit any signed-in user.

### `Argument of type '600' is not assignable to parameter of type '`${number}ms` | …'`, on `requireFresh()`

The full message ends `` '`${number}ms` | `${number}s` | `${number}m` |
`${number}h` | `${number}d`' ``; the same for `'10 minutes'`.

**Why:** `requireFresh(ctx, maxAge)` takes a duration with its unit. A bare
number would be milliseconds to `@nxgt/janus` and seconds to `@fresh`, so
neither is guessed.

**Fix:** `requireFresh(ctx, '10m')`.

### `Expected 2 arguments, but got 1`, on `requireFresh()`

**Why:** `requireFresh(ctx)` — how recent the proof must be has no default.

**Fix:** `requireFresh(ctx, '10m')`.

### `Type 'number' is not assignable to type 'Clock'`

**Why:** `useJanus({ auth, clock: Date.now() })` — a timestamp, where a
clock answers `now()`.

**Fix:** pass the clock given to `janus()`, `fixedClock(…)` in a spec, or
leave `clock` out.
