# Guarded routes and writing tuples

The permissions side of `@nxgt/janus` in Hono routes. A **guarded route** runs
only when its subject holds a permission on the object it serves:
`permission()` makes it one. `provide()` puts the instances on the context, for
the routes that grant and revoke. The model, `can` and the tuples are
[`@nxgt/janus`'s permissions guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/permissions.md);
this page is only about the routes.

The examples use this model, and one loader for its records:

```ts
import { byParam } from '@nxgt/janus-hono';
import { defineModel, fromField, permissions, when } from '@nxgt/janus/permissions';

const model = defineModel({
	subjects: auth.types, // 'patient', 'staff'
	types: {
		record: {
			relations: {
				owner: ['patient'],
				// Read from the record itself; the lookup lets list() find a doctor's records.
				doctor: fromField('doctorId', 'staff', {
					lookup: (staffId) => records.idsByDoctor(staffId),
				}),
			},
			permissions: {
				view: ['owner', 'doctor'],
				edit: [when('owner', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});

export const access = permissions({ model, store: relations });

/** The record a route's `:id` names; `null`, a 404, when there is none. */
export const recordOf = byParam('id', (id) => records.find(id)); // records: your own store
```

`byParam(name, find)` is a `load`: it reads one path parameter and answers
`find(id)`. Written by hand, it is

```ts
import type { Context } from 'hono';

const recordOfByHand = (c: Context) => {
	const id = c.req.param('id');
	return id === undefined ? null : records.find(id);
};
```

A loader takes a plain `Context` because it is written apart from any route,
and `permission()` is too: Hono types a path's parameters only in a handler
written inline on that route. So `c.req.param('id')` is `string | undefined`
in a loader, and the missing case is answered `null`. Pass `find` as an arrow
— `(id) => records.find(id)` — when it is a method that reads `this`.

## A guarded route

```ts
import { permission, session } from '@nxgt/janus-hono';

app.get(
	'/records/:id',
	session(auth),
	permission(access, 'view', 'record', recordOf),
	(c) => c.json(c.var.object),
);
```

`permission(access, permission, type, load)` — the order of `list(subject,
permission, type)` — runs in this order:

| Step | When it stops | Answered |
| --- | --- | --- |
| 1. The subject: `c.var.user`, set by `session()` | anonymous | 401, no body — nothing is loaded |
| 2. `load(c)` | it answers `null` | 404, no body |
| 3. `access.can(subject, permission, object)`, the object seen with `type` added | `false` | 403, no body |
| 4. `c.set('object', object)`, then the route | — | the route's answer |

A relation store that cannot answer at step 3 **throws** `STORE_FAILED`, and
`janusErrors()` answers it 503 — never 403: an outage does not deny anybody.
Whatever `load` throws reaches `app.onError` too, and goes to
`janusErrors({ fallback })`.

### What `load` answers

The object as your application keeps it: its `id`, **every field a
`fromField` of its type reads** — `doctorId` here — and whatever else it
carries. The route gets exactly that, with its own type: `c.var.object` is
your record, not a reference to it, and the route does not load it again.

`can()` sees the object with `type` set to the object type named in
`permission()` — a `type` field of your own is not read by the check, and
stays in `c.var.object`. Every other field is read from the object itself, so
a class instance's getters and an ORM document's accessors answer as they do
in the route.

An object missing a `fromField`'s field is a compile error. At run time it
would be a `TypeError` from `can()`, never a denial. A field that holds nobody
is `null`.

### One per route

`permission()` sets `c.var.object`, so a route has one. A second throws a
`TypeError` at the first request rather than type `c.var.object` as both
objects at once. A parent — the folder of a record — is checked through an
arrow in the model: `view: ['owner', 'folder->view']`.

### A condition's context

A permission that reaches a `when()` needs its `ctx`, and `permission()`
requires the option exactly then, typed from the condition — through arrows
too. It is a function of the request and the loaded object:

```ts
app.put(
	'/records/:id',
	session(auth),
	permission(access, 'edit', 'record', recordOf, {
		ctx: (c, record) => ({ locked: record.locked }),
	}),
	async (c) => c.json(await records.update(c.var.object.id, await c.req.json())),
);
```

### Another subject

`c.var.user` is the subject by default. Pass `subject` when your users are not
`janus()`'s — the permissions side used alone — or when the subject is not the
signed-in user:

```ts
permission(access, 'view', 'record', recordOf, {
	subject: (c) => subjectOfApiKey(c.req.header('x-api-key')), // { type, id } or null
});
```

`null` is anonymous, and answered 401 before anything is loaded. Without
`session()` before it and without `subject`, `permission()` throws a
`TypeError` at the first request: a wiring error, never an anonymous 401.

### Hiding what exists

A 403 tells the caller the object exists. Where that is a leak, make `load`
answer `null` for what the user may not see — ask `can()` there, so a record
they may not view is a 404 like one that does not exist:

```ts
permission(access, 'view', 'record', async (c) => {
	const record = await recordOf(c);
	return record !== null &&
		(await access.can(c.get('user'), 'view', { ...record, type: 'record' }))
		? record
		: null;
});
```

## A list route

`permission()` guards one object. For the objects a user may see, ask
`list()` — through `provide()` — and load what it answers:

```ts
app.get(
	'/records',
	session(auth, { required: true }),
	provide({ access }),
	async (c) => {
		const page = await c.var.access.list(c.var.user, 'view', 'record', {
			after: c.req.query('after') ?? null,
		});
		return c.json({
			records: await records.findMany(page.items),
			nextCursor: page.nextCursor,
		});
	},
);
```

`list()` reverses every rule of `view`, so `doctor` needs its `lookup`:
without one, this call does not compile. When a user only ever sees what
names them — a patient's own records — a query filtered on `c.var.user.id`
is shorter, and needs no `list()`.

## Writing tuples from a route

`provide({ auth, access })` sets `c.var.auth` and `c.var.access` to the
instances — only those given, and typed — so a route writes through the
context rather than a module import, and a test can hand those routes other
instances. `permission()` takes its instance as an argument.

```ts
import { permission, provide, session } from '@nxgt/janus-hono';

const app = new Hono().use(session(auth), provide({ auth, access }));

app.post('/records', session(auth, { type: 'patient', required: true }), async (c) => {
	const record = await records.create(await c.req.json());
	await c.var.access.grant({ type: 'record', id: record.id }, 'owner', c.var.user);
	return c.json(record, 201);
});

app.delete(
	'/records/:id/owner',
	session(auth, { type: 'patient', required: true }),
	permission(access, 'edit', 'record', recordOf, {
		ctx: (c, record) => ({ locked: record.locked }),
	}),
	async (c) => {
		await c.var.access.revoke({ type: 'record', id: c.var.object.id }, 'owner', c.var.user);
		return c.body(null, 204);
	},
);
```

`grant` and `revoke` are typed from the model as everywhere: a relation read
from a field — `doctor` — cannot be granted, and a subject the relation does
not admit is a compile error. Both are idempotent.

## See also

- [The routes of an application](routes.md) — `session()`, the cookie, the statuses
- [Troubleshooting](../troubleshooting.md)
