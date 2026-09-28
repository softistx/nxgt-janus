# The context

This page is for everything a resolver reads from `@nxgt/janus`: the user and
the session on `ctx.janus`, the directive that guards a field or a type, the
two helpers, and the types that make `ctx` precise. For what a client receives
when a request is refused, see [errors](errors.md).

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
does not build, since `@authenticated` is not declared.

| Option | What it does |
| --- | --- |
| `auth` | What `janus()` answered. Required |
| `access` | What `permissions()` answered: `ctx.janus.access`, and what `can()` asks. Optional |
| `type` | A user type: a user of any other type is anonymous on this server, as `auth.authenticate(request, { type })` answers |

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

## `@authenticated`

```graphql
type Query {
	me: User @authenticated                      # any signed-in user
	roster: [Staff!]! @authenticated(type: ["staff"])
}

type Ward @authenticated(type: ["staff"]) {    # every field of Ward
	name: String
	chart: String @authenticated(type: ["staff", "patient"])
}

interface Audited {
	trail: String @authenticated(type: ["staff"]) # trail, on every type implementing Audited
}
```

| Written on | Guards |
| --- | --- |
| a field | that field |
| an object type | every field of that type |
| an interface | every field of every object type implementing it |
| an interface's field | the field of the same name on every object type implementing it |

**Every one that applies must hold.** On `Ward.chart` above, the type's
`["staff"]` and the field's `["staff", "patient"]` both apply: only staff pass.
The directive runs before the resolver, which never runs for a refused
request.

| The request | Answered |
| --- | --- |
| anonymous | `UNAUTHENTICATED`, 401 |
| a user of a type no `type:` names | `FORBIDDEN`, 403 |
| a store that cannot answer | `SERVICE_UNAVAILABLE`, 503 |
| a user every directive admits | the resolver runs |

A type's directive guards the type's fields, **not the field that returns
it**: `Query.ward` above runs for an anonymous request, and the refusal lands
on `ward.name`. Guard the field too when the lookup itself must not run.

### Refused when the schema is built

What no request could ever pass is a `TypeError` at start-up, naming the
field:

```
TypeError: applyJanusDirectives(): @authenticated on Query.me names the user type 'doctor', which is not one of 'patient', 'staff'
TypeError: applyJanusDirectives(): @authenticated on Ward (read by Ward.name) names the user type 'nurse', which is not one of 'patient', 'staff'
TypeError: applyJanusDirectives(): @authenticated on Query.me names no user type — leave type: out to admit any signed-in user
TypeError: applyJanusDirectives(): the @authenticated on Ward.chart and on its type or interfaces admit no user type in common
```

Under `useJanus({ type: 'staff' })`, the only user type a directive may name
is `'staff'`.

## `@permission` — coming

`@permission(name: String!, type: String!, id: String, onDeny: PermissionDenial! = NOT_FOUND)`
is declared in `janusTypeDefs`, so a schema can be written against it, and it
is **refused, not ignored**, until it is enforced:

```
TypeError: applyJanusDirectives(): @permission on Query.record is not enforced yet — check it in the resolver with can(ctx, …) until it is
```

A guard that let the field through silently would be worse than none. Until
it lands, check the permission in the resolver with `can()`, below. What it
will do is on the [roadmap](../roadmap.md).

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

It needs `useJanus({ access })`: without it, `can(ctx, …)` does not compile,
and a context built by hand without `access` throws
`TypeError: can(): ctx.janus.access is not set — pass { access } to useJanus()`.

## The transform alone

`applyJanusDirectives(schema, { auth, type? })` is what `useJanus()` runs on
every schema. Call it to check a schema at build time — in a test, or in a
script that fails a deploy — without starting a server:

```ts
import { applyJanusDirectives } from '@nxgt/janus-graphql';

applyJanusDirectives(schema, { auth }); // throws the TypeErrors above, or answers the guarded schema
```

The guards it installs read `ctx.janus`, which only `useJanus()` builds: a
guarded field resolved under any other context throws
`TypeError: @authenticated on Query.me: ctx.janus is not set — add useJanus({ auth }) to the plugins`.
