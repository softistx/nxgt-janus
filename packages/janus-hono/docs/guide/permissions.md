# Guarded routes and writing tuples

The permissions side of `@nxgt/janus` in Hono routes: `permission()` lets a
request through only if its subject holds a permission on the object the route
serves, and `provide()` puts the instances on the context, for the routes that
grant and revoke. The model, `can` and the tuples are
[`@nxgt/janus`'s permissions guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/permissions.md);
this page is only about the routes.

The examples use this model:

```ts
import { defineModel, fromField, permissions, when } from '@nxgt/janus/permissions';

const model = defineModel({
	subjects: auth.types, // 'patient', 'staff'
	types: {
		record: {
			relations: {
				owner: ['patient'],
				doctor: fromField('doctorId', 'staff'), // read from the record itself
			},
			permissions: {
				view: ['owner', 'doctor'],
				edit: [when('owner', (ctx: { locked: boolean }) => !ctx.locked)],
			},
		},
	},
});

export const access = permissions({ model, store: relations });
```

## A guarded route

```ts
import { permission, session } from '@nxgt/janus-hono';

app.get(
	'/records/:id',
	session(auth),
	permission(access, 'view', 'record', (c) => records.find(c.req.param('id'))),
	(c) => c.json(c.var.object),
);
```

`permission(access, permission, type, load)` — the order of `list(subject,
permission, type)` — runs in this order:

| Step | When it stops | Answered |
| --- | --- | --- |
| 1. The subject: `c.var.user`, set by `session()` | anonymous | 401, no body — nothing is loaded |
| 2. `load(c)` | it answers `null` | 404, no body |
| 3. `access.can(subject, permission, { ...object, type })` | `false` | 403, no body |
| 4. `c.set('object', object)`, then the route | — | the route's answer |

A store that cannot answer, at step 3 or in `load`, **throws**: `STORE_FAILED`
reaches `app.onError`, and `janusErrors()` answers it 503. It is never a 403 —
an outage does not deny anybody.

### What `load` answers

The object as your application keeps it: its `id`, **every field a
`fromField` of its type reads** — `doctorId` here — and whatever else it
carries. The middleware adds `type` for the check, and hands the route what
`load` answered, with its own type: `c.var.object` is your record, not a
reference to it. The route does not load it a second time.

An object missing a `fromField`'s field is a compile error, not a silent
denial. A field that holds nobody is `null`.

`c.req.param()` is `string | undefined` in `load`: Hono types a route's path in
its own handler only, never in a middleware. A missing id is simply nothing to
load — answer `null`, and the request gets a 404.

### A condition's context

A permission that reaches a `when()` needs its `ctx`, and `permission()`
requires the option exactly then, typed from the condition. It reads the
request and the loaded object:

```ts
app.put(
	'/records/:id',
	session(auth),
	permission(access, 'edit', 'record', (c) => records.find(c.req.param('id')), {
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
permission(access, 'view', 'record', load, {
	subject: (c) => serviceAccountOf(c.req.header('x-api-key')), // { type, id } or null
});
```

Without `session()` before it and without `subject`, `permission()` throws a
`TypeError` at the first request: a wiring error, never an anonymous 401.

### Hiding what exists

A 403 tells the caller the object exists. Where that is a leak, make `load`
answer `null` for what the user may not see — `list()` gives the ids they may:

```ts
permission(access, 'view', 'record', async (c) => {
	const record = await records.find(c.req.param('id'));
	return record !== null && (await access.can(c.var.user, 'view', { type: 'record', ...record }))
		? record
		: null; // 404 either way
});
```

## Writing tuples from a route

`provide({ auth, access })` sets `c.var.auth` and `c.var.access` to the
instances — only those given, and typed — so a route writes through the
context rather than a module import, and a test can hand the app other
instances:

```ts
import { provide, session } from '@nxgt/janus-hono';

const app = new Hono().use(session(auth), provide({ auth, access }));

app.post('/records', session(auth, { type: 'patient', required: true }), async (c) => {
	const record = await records.create(await c.req.json());
	await c.var.access.grant({ type: 'record', id: record.id }, 'owner', c.var.user);
	return c.json(record, 201);
});

app.delete(
	'/records/:id/owner',
	session(auth, { type: 'patient', required: true }),
	permission(access, 'edit', 'record', (c) => records.find(c.req.param('id')), {
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
