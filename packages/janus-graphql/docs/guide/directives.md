# Directives

This page is for guarding a schema: `@authenticated`, which asks who the user
is, and `@permission`, which asks what the user may do to one object. Both
are declared in `janusTypeDefs`, applied by `useJanus()` when the server
builds its schema, and checked before the resolver runs — a refused request
never reaches it.

```ts
import { janusMaskError, janusTypeDefs, useJanus } from '@nxgt/janus-graphql';
import { createSchema, createYoga } from 'graphql-yoga';

export const yoga = createYoga({
	schema: createSchema({ typeDefs: [janusTypeDefs, typeDefs], resolvers }),
	plugins: [
		useJanus({
			auth,
			access,
			loaders: { record: (id) => records.find(id) }, // what @permission loads by id
			conditions: { record: (record, ctx: Context) => ({ onShift: ctx.shift.open }) }, // a when()'s ctx
		}),
	],
	maskedErrors: { maskError: janusMaskError() },
});
```

## Where a directive applies

Both directives go on a field, an object type or an interface:

| Written on | Guards |
| --- | --- |
| a field | that field |
| an object type | every field of that type |
| an interface | every field of every object type implementing it |
| an interface's field | the field of the same name on every object type implementing it |

GraphQL runs resolvers on object types only, so a directive on an interface
is applied to each type implementing it, when the schema is built: nothing
an interface declares is left unguarded, and a type added later that
implements it is guarded too.

**Every directive that applies must hold** — the field's, its type's, its
interfaces'. A type's directive guards the type's fields, **not the field that
returns it**: `Query.ward` below runs for an anonymous request, and the
refusal lands on `ward.name`. Guard the field too when the lookup itself must
not run.

## `@authenticated(type: [String!])`

```graphql
type Query {
	me: User @authenticated                      # any signed-in user
	roster: [Staff!]! @authenticated(type: ["staff"])
	ward(id: ID!): Ward
}

type Ward @authenticated(type: ["staff"]) {    # every field of Ward
	name: String
	chart: String @authenticated(type: ["staff", "patient"])
}

interface Audited {
	trail: String @authenticated(type: ["staff"]) # trail, on every type implementing Audited
}
```

On `Ward.chart` above, the type's `["staff"]` and the field's
`["staff", "patient"]` both apply: only staff pass.

| The request | Answered |
| --- | --- |
| anonymous | `UNAUTHENTICATED`, 401 |
| a user of a type no `type:` names | `FORBIDDEN`, 403 |
| a store that cannot answer | `SERVICE_UNAVAILABLE`, 503 |
| a user every directive admits | the resolver runs |

Under `useJanus({ type: 'staff' })`, the only user type a directive may name
is `'staff'`.

## `@permission(name, type, id, onDeny)`

```graphql
directive @permission(
	name: String!
	type: String!
	id: String
	onDeny: PermissionDenial! = NOT_FOUND
) repeatable on OBJECT | INTERFACE | FIELD_DEFINITION
```

Only a user holding permission `name` on the object of `type` whose id `id`
reads reaches the field. It is `@nxgt/janus-hono`'s
`permission(access, permission, type, load)` for a schema, and asks
`access.can` — the `permissions()` instance given to `useJanus()`.

| Argument | What it is |
| --- | --- |
| `name` | A relation or a permission `type` declares in the model — what `access.can` may be asked |
| `type` | An object type of the model |
| `id` | Where the object's id is read: `args.<path>` or `parent.<path>`. Absent: `args.id` on a field, `parent.id` on a type or an interface |
| `onDeny` | What a denial answers: `NOT_FOUND`, 404, by default, or `FORBIDDEN`, 403 |

`@permission` implies `@authenticated`: an anonymous request is answered
`UNAUTHENTICATED`, 401, before any object is loaded or any check asked.

### Reading the id

```graphql
type Query {
	record(id: ID!): Record @permission(name: "view", type: "record")         # args.id
	transfer(input: TransferInput!): Transfer
		@permission(name: "manage", type: "ward", id: "args.input.wardId") # a path into an input
}

type Record @permission(name: "view", type: "record") {                    # parent.id: the record itself
	title: String
}

type Visit {
	notes: String @permission(name: "enter", type: "ward", id: "parent.wardId") # another object, by id
}
```

A path is `args` or `parent` followed by one or more names, each read from the
value before it. Where a step reads a list, the path goes on through every
element.

What `access.can` is given depends on where the id was read:

| The id | The object `access.can` is given |
| --- | --- |
| `parent.id`, or `parent.<path>.id` | **The value that holds it** — the parent, or the value the path reached — with `type` added, read through a proxy: a getter, a class's `#private` state or an ORM document's accessors answer as they do in the resolver |
| any other `parent.<path>`, or `args.<path>`, on a type with no `fromField` | `{ type, id }` |
| the same, on a type with a `fromField` | **What `loaders[type](id, ctx)` answers**, with `type` added — the `fromField`s read its fields. `null` is answered `NOT_FOUND` |

A `fromField` relation is read from the object's own data — a record's
`doctorId` — so the object must carry that field. The parent does when its
resolver answered the record; an id alone does not, and the loader is what
turns one into the object. A type with no `fromField` may have a loader too:
it is then asked for every id `@permission` reads alone — from `args`, or
from a parent field other than `id` — and its
`null` answers `NOT_FOUND` for an object that does not exist.

```ts
useJanus({
	auth,
	access,
	loaders: {
		record: (id, ctx: Context) => records.find(id), // { id, doctorId, … } or null
	},
});
```

An id that holds `@`, `#` or a parenthesis, or is empty, names no object:
it is answered `NOT_FOUND` without asking.

### Lists

```graphql
type Query {
	records(ids: [ID!]!): [Record!]! @permission(name: "view", type: "record", id: "args.ids")
}

type Team {
	wards: [Ward!]!
	summary: String @permission(name: "enter", type: "ward", id: "parent.wards.id")
}
```

**A list requires the permission on every element**: one denial denies the
field. The checks of a list are asked together. An empty list in `args` asks
nothing, and the resolver runs: the client asked for nothing. An empty list
in the parent is answered `NOT_FOUND`: the object's data names nothing to
check, and its fields are not open to every user for it. This is not a filter: to answer only the items a user
may see, ask `access.list()` for their ids and load those.

### Conditions

A permission whose rules reach a `when()` needs a `ctx`, as `access.can`
does. `conditions` answers it, per object type, from the object checked and
the request's context:

```ts
// model: record.permits.edit = [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)]
useJanus({
	auth,
	access,
	loaders: { record: (id) => records.find(id) },
	conditions: {
		record: async (record, ctx: Context) => ({ onShift: await shifts.isOpen(ctx) }),
	},
});
```

One entry per type covers every permission of it: it answers every
condition any of them reaches, typed as the intersection of their `ctx`s.

### Repeated, and in order

```graphql
type Query {
	discharge(id: ID!): Discharge
		@permission(name: "view", type: "record")
		@permission(name: "discharge", type: "record", onDeny: FORBIDDEN)
}
```

**Every one must hold** — an either-or belongs in the model, as a
permission whose rules name both. They are asked **one at a time, in order**,
and the first that denies answers: the ones after it are never asked.

The order across locations is outermost first: the interfaces' directives,
the type's, the interfaces' fields', then the field's own. So a type's
`NOT_FOUND` answers before a field's `FORBIDDEN` could tell that the object
exists.

### `NOT_FOUND` or `FORBIDDEN`

`NOT_FOUND` is the default, because a `FORBIDDEN` says *this exists, and not
for you*: for `record(id: "r42")` that is already an answer to a question the
user may not ask. Choose `onDeny: FORBIDDEN` where the object is known to
exist anyway — a field of an object the user may already see:

```graphql
type Record @permission(name: "view", type: "record") {
	title: String
	billing: Billing @permission(name: "manage", type: "record", onDeny: FORBIDDEN)
}
```

| The request | Answered |
| --- | --- |
| anonymous | `UNAUTHENTICATED`, 401 |
| a user of a type `@authenticated` does not name | `FORBIDDEN`, 403, before any check |
| no id at the path, an empty list in the parent, or an id no object can hold | `NOT_FOUND`, 404 |
| a loader answering `null` | `NOT_FOUND`, 404 |
| a denial | `onDeny`: `NOT_FOUND`, 404, or `FORBIDDEN`, 403 |
| a store — or a loader — that cannot answer | `SERVICE_UNAVAILABLE`, 503, never a denial |
| every permission held | the resolver runs |

A path that reads nothing — an optional argument left out, a `null` field of
the parent — is answered `NOT_FOUND`, and said once per directive through
`process.emitWarning`: `@permission on Query.record resolved no object id
from args.id — answered NOT_FOUND`.

### One check per question, per request

The same question asked twice in one request is asked once: two fields —
aliased or not — a directive and a resolver's `can()`, or two fields resolved
at once, which share the one pending answer. The question is the notation
`record:r1#view@staff:u1`: object, permission and subject. Across requests
nothing is kept.

Not remembered: a check with a condition's `ctx`, which the question does
not hold; an anonymous one, which costs no store call; and a failure — the
next question asks again.

**A subscription skips the memo.** It is one request whose fields resolve
again on every event, so each event asks afresh and a `revoke()` made since
the subscription started stops the next event. **A mutation does not**: a
mutation that grants or revokes and then asks the same question in the same
request reads the answer remembered before the change. Ask
`access.can` directly after such a change, or answer from the mutation's own
result.

## Refused when the schema is built

What no request could ever pass is a `TypeError` at start-up, naming the
field, and the location the directive was written on when it is not the
field — `(read by Ward.name)`:

```
TypeError: applyJanusDirectives(): @authenticated on Query.me names the user type 'doctor', which is not one of 'patient', 'staff'
TypeError: applyJanusDirectives(): @authenticated on Query.me names no user type — leave type: out to admit any signed-in user
TypeError: applyJanusDirectives(): the @authenticated on Ward.chart and on its type or interfaces admit no user type in common
TypeError: applyJanusDirectives(): @permission on Query.ward needs the permissions() instance — pass useJanus({ auth, access }), with access what permissions() answered
TypeError: applyJanusDirectives(): @permission on Query.invoice names the object type 'invoice', which is not one of 'record', 'ward'
TypeError: applyJanusDirectives(): @permission on Query.ward asks 'delete', which ward does not declare — it declares 'nurses', 'visitors', 'enter', 'manage'
TypeError: applyJanusDirectives(): @permission on Query.ward reads its id from 'ward.id', which is not args.<name> or parent.<name>
TypeError: applyJanusDirectives(): @permission on Query.ward reads args.wardId, and Query.ward takes no argument wardId
TypeError: applyJanusDirectives(): @permission on Query.record reads the record's id from args.id, and record reads 'doctorId' of the object itself (fromField) — pass useJanus({ loaders: { record: (id, ctx) => … } })
TypeError: applyJanusDirectives(): @permission on Query.record asks 'edit' of record, which reaches a when() — pass useJanus({ conditions: { record: (object, ctx) => … } })
TypeError: applyJanusDirectives(): @permission on Query.ward finds loaders.ward, which is not a function
```

Each is in [troubleshooting](../troubleshooting.md), with its fix. The
compiler refuses the wiring's own mistakes before that: a loader for a type
the model does not declare, a loader answering an object without a field a
`fromField` reads, a condition for a type no `when()` is reached on, a `ctx`
of the wrong shape, and `loaders` or `conditions` without `access`.

## The transform alone

`applyJanusDirectives(schema, { auth, type?, access?, loaders?, conditions? })`
is what `useJanus()` runs on every schema. Call it to check a schema at build
time — in a test, or in a script that fails a deploy — without starting a
server:

```ts
import { applyJanusDirectives } from '@nxgt/janus-graphql';

applyJanusDirectives(schema, { auth, access, loaders, conditions }); // throws the TypeErrors above
```

The guards it installs read `ctx.janus`, which only `useJanus()` builds: a
guarded field resolved under any other context throws
`TypeError: @permission on Query.ward: ctx.janus is not set — add useJanus({ auth }) to the plugins`.
