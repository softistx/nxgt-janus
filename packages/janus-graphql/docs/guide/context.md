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
  the `Request` Yoga puts there.
- **Every schema the server is given has its directives applied**, once, by
  `applyJanusDirectives()`. A schema set later — a gateway reloading its
  supergraph — is applied too. The schema it made is remembered, so envelop
  calling the hook again with it does not loop.

`janusTypeDefs` must be among the type definitions: without it, the schema
does not build, since `@authenticated` and `@permission` are not declared.

| Option | What it does |
| --- | --- |
| `auth` | What `janus()` answered. Required |
| `access` | What `permissions()` answered: `ctx.janus.access`, what `can()` and `@permission` ask. Optional — and required once the schema uses `@permission` |
| `type` | A user type: a user of any other type is anonymous on this server, as `auth.authenticate(request, { type })` answers |
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
in passing, and **nothing here sends the renewed cookie back**: a GraphQL
response carries no `Set-Cookie` from this package.

`JanusContext<typeof auth, typeof access, Type>` takes the third argument
when `useJanus({ type })` narrows the server:

```ts
type StaffContext = YogaInitialContext & JanusContext<typeof auth, typeof access, 'staff'>;
// (await ctx.janus.user())?.username — a staff member's field, typed
```

Without `access`, write `JanusContext<typeof auth>`: `ctx.janus.access` is
then absent from the type, as it is from the context.

## Directives

`@authenticated` and `@permission` guard a field, a type or an interface
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
typed as the union of them. Without `type`, any signed-in user.

Use it where a directive does not fit: a mutation that must know the user
anyway, or a type that depends on the arguments.

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
`{ ctx }` is always asked. See
[one check per question](directives.md#one-check-per-question-per-request).

It needs `useJanus({ access })`: without it, `can(ctx, …)` does not compile,
and a context built by hand without `access` throws
`TypeError: can(): ctx.janus.access is not set — pass { access } to useJanus()`.
