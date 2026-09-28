# The context

This page is for everything a resolver reads from `@nxgt/janus`: the user and
the session on `ctx.janus`, the two helpers, and the types that make `ctx`
precise. For the directives that guard a field or a type, see
[directives](directives.md); for what a client receives when a request is
refused, see [errors](errors.md).

## Wiring

```ts
import { janusMaskError, janusTypeDefs, useJanus } from '@nxgt/janus-graphql';
import { createSchema, createYoga } from 'graphql-yoga';

export const yoga = createYoga({
	schema: createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers }),
	plugins: [useJanus({ auth, access })],
	maskedErrors: { maskError: janusMaskError() },
});
```

`useJanus()` does two things, and nothing else:

- **Every request's context gets `ctx.janus`**, built from `context.request`,
  the `Request` Yoga puts there — or, for an operation over graphql-ws,
  from the credential of the connection `janusConnection().onConnect`
  accepted, found through `ctx.extra`
  ([subscriptions over graphql-ws](subscriptions.md)).
- **Every schema the server is given has its directives applied**, once, by
  `applyJanusDirectives()`. A schema set later — a gateway reloading its
  supergraph — is applied too. The schema it made is remembered, so envelop
  calling the hook again with it does not loop.

`janusTypeDefs` must be among the type definitions: without it, the schema
does not build, since `@authenticated`, `@fresh` and `@permission` are not
declared.

| Option | What it does |
| --- | --- |
| `auth` | What `janus()` answered. Required |
| `access` | What `permissions()` answered: `ctx.janus.access`, what `can()` and `@permission` ask. Optional — and required once the schema uses `@permission` |
| `type` | A user type: a user of any other type is anonymous on this server, as `auth.authenticate(request, { type })` answers |
| `clock` | What `@fresh` and `requireFresh()` read the time from: the clock given to `janus()`, when it is not the system's — `fixedClock` in a spec. Absent, the system's |
| `loaders` | Per object type, `(id, ctx) => object \| null`: the object `@permission` checks when it reads an id alone — from `args`, or a parent field other than `id`. Required for a type with a `fromField` — see [directives](directives.md#reading-the-id) |
| `conditions` | Per object type, `(object, ctx) => its when()s' ctx`: what `@permission` passes as `{ ctx }` — see [directives](directives.md#conditions) |

## `ctx.janus`

```ts
import type { JanusContext } from '@nxgt/janus-graphql';
import type { YogaInitialContext } from 'graphql-yoga';

type Context = YogaInitialContext & JanusContext<typeof auth, typeof access>;

const resolvers = {
	Query: {
		greeting: async (_: unknown, __: unknown, ctx: Context) => {
			const user = await ctx.janus.user(); // User<'patient', …> | User<'staff', …> | null
			return user === null ? 'Hello' : `Hello, ${user.type}`;
		},
		expires: async (_: unknown, __: unknown, ctx: Context) =>
			(await ctx.janus.session())?.expiresAt.toISOString() ?? null,
	},
};
```

| Member | What it answers |
| --- | --- |
| `user()` | The user the request belongs to, as a union narrowed by `user.type`, or `null` for an anonymous request |
| `session()` | The session it presented, or `null` |
| `access` | The `permissions()` instance, when `useJanus()` was given one |

**Lazy, and once per request.** `auth.authenticate(request)` runs the first
time `user()` or `session()` is asked, and both share its answer: a query
whose fields ask ten times costs one store call, and a query that asks
nothing — an introspection, a field no directive guards — costs none.

**An outage is not anonymous.** When a store cannot answer, `user()` rejects
with `STORE_FAILED` rather than answering `null`, and the client receives
`SERVICE_UNAVAILABLE`, 503 — see [errors](errors.md).

`authenticate` reads the request as it does anywhere: `Authorization:
Bearer`, then `X-Session-Token`, then the cookie. It renews a sliding session
in passing, and **`useJanus()` sends the renewed cookie back**, as
`@nxgt/janus-hono`'s `session()` does:

| The request | The response |
| --- | --- |
| Presented the session cookie, and `authenticate` renewed it | `Set-Cookie` with the session's new `Expires` — once, for a batch of operations too |
| Presented the cookie, not yet due for renewal | No `Set-Cookie` |
| `Authorization: Bearer` or `X-Session-Token` | No `Set-Cookie`, renewed or not: the client never asked for a cookie, and reads the new expiry from `session().expiresAt` |
| Anonymous, or no field asked `user()` or `session()` | No `Set-Cookie`, and no store call |
| The store failed | No `Set-Cookie`: the response is the 503 |
| A mutation of yours already set the session cookie — a sign-in, a sign-out | Yours: the renewal never overwrites it |

The cookie is `auth.cookie.serialize(token, session)`, under the attributes
`janus({ cookie })` resolved. It is set in Yoga's `onResponse` hook:

- **A server on envelop alone** never calls it, and sends no renewed cookie.
- **An operation over graphql-ws** has no response per operation, so none is
  sent: the store holds the renewed session, but the browser keeps its
  cookie's old expiry. That renewal is spent — an HTTP query right after
  finds the session not yet due, and sends nothing — so the cookie is sent
  again by the next renewal over HTTP, a `renewAfter` later. A client whose
  only traffic is the WebSocket for longer than the lifespan minus
  `renewAfter` should renew through an HTTP route of yours. See
  [subscriptions](subscriptions.md).
- **An `auth` of your own** — a wrapper that counts or caches — must pass on
  `cookie: auth.cookie` beside `authenticate` and `types`; without it, no
  renewed cookie is sent.

`JanusContext<typeof auth, typeof access, Type>` takes the third argument
when `useJanus({ type })` narrows the server:

```ts
type StaffContext = YogaInitialContext & JanusContext<typeof auth, typeof access, 'staff'>;
// (await ctx.janus.user())?.username — a staff member's field, typed
```

Without `access`, write `JanusContext<typeof auth>`: `ctx.janus.access` is
then absent from the type, as it is from the context.

## Directives

`@authenticated`, `@fresh` and `@permission` guard a field, a type or an interface
before its resolver runs: see [directives](directives.md). This page covers
what a resolver checks itself, where a directive does not fit.

## `requireUser(ctx, { type? })`

```ts
import { requireUser } from '@nxgt/janus-graphql';

const resolvers = {
	Mutation: {
		admitPatient: async (_: unknown, args: { id: string }, ctx: Context) => {
			const staff = await requireUser(ctx, { type: 'staff' });
			return wards.admit(args.id, { by: staff.username }); // typed: a staff member
		},
	},
};
```

The signed-in user, narrowed to `type` — or a denial: `UNAUTHENTICATED` for
an anonymous request, `FORBIDDEN` for a user of another type. `type` takes
one user type or a list, `{ type: ['staff', 'patient'] }`, and the answer is
typed as the union of them. Without `type`, any signed-in user. An empty list
is refused — by the compiler, and with a `TypeError` for a list built at run
time — since no user could pass it.

Use it where a directive does not fit: a mutation that must know the user
anyway, or a type that depends on the arguments.

## `requireFresh(ctx, maxAge)`

```ts
import { requireFresh } from '@nxgt/janus-graphql';

const resolvers = {
	Mutation: {
		transfer: async (_: unknown, { amount }: { amount: number }, ctx: Context) => {
			if (amount > 1_000) await requireFresh(ctx, '5m');
			return payments.transfer(ctx, amount);
		},
	},
};
```

The request's session, once it proved who it is less than `maxAge` ago —
signed in, or confirmed since by `auth.stepUp.confirm` — or a denial:
`UNAUTHENTICATED` for an anonymous request, `STEP_UP_REQUIRED`, 403, for an
older session. A store that cannot answer is `SERVICE_UNAVAILABLE`. It is
`@fresh` in a resolver, for a rule that depends on the arguments, on
`useJanus({ clock })`'s clock.

`maxAge` is a duration **with its unit** — `'5m'`, `'300s'`, `'1h'` — and
never a bare number: `@nxgt/janus` reads a number as milliseconds, where
`@fresh(maxAge: 300)` reads seconds, so the compiler refuses one and the call
throws a `TypeError` for one built at run time. What the client does next is
in [the step-up over GraphQL](step-up.md).

## `can(ctx, permission, object, options?)`

```ts
import { can } from '@nxgt/janus-graphql';

const resolvers = {
	Query: {
		record: async (_: unknown, { id }: { id: string }, ctx: Context) => {
			const record = await records.find(id);
			if (record === null) return null;
			return (await can(ctx, 'view', { type: 'record', ...record })) ? record : null;
		},
	},
};
```

`access.can` for the request's user, **typed as `access.can` is**: the
permission must be one the object's type declares, the object must carry
every field its `fromField`s read, and `{ ctx }` is required exactly when the
permission reaches a condition. An anonymous request answers `false`, with no
store call. A store that cannot answer is `SERVICE_UNAVAILABLE`, never
`false`.

**It shares the request's checks with `@permission`.** A question a directive
already asked in this request — the same object, permission and user — is
answered from that check, and two asked at once share one; a check with
`{ ctx }` is always asked. In a subscription, whose one request lasts the
whole stream, call `ctx.janus.access.can` instead, so a `revoke()` is seen. See
[one check per question](directives.md#one-check-per-question-per-request).

It needs `useJanus({ access })`: without it, `can(ctx, …)` does not compile,
and a context built by hand without `access` throws
`TypeError: can(): ctx.janus.access is not set — pass { access } to useJanus()`.
