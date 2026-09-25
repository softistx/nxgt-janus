# @nxgt/janus-hono

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) in a
[Hono](https://hono.dev) app: the signed-in user on every request, the session
cookie set and cleared, a route guarded by a permission, the instances on the
context to grant and revoke through, and every error answered with the status
it deserves — an outage as 503, never as 401 or 403.

```ts
import { janusErrors, sendSession, session, signOut } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { auth } from './auth'; // what janus() answered

const app = new Hono()
	.post('/sign-in', async (c) => {
		const { email, password } = await c.req.json();
		const user = sendSession(c, auth, await auth.signIn({ email, password }));
		return c.json({ id: user.id }); // the token is in the cookie, not the body
	})
	.post('/sign-out', async (c) => {
		await signOut(c, auth);
		return c.body(null, 204);
	})
	.get('/me', session(auth, { required: true }), (c) =>
		c.json({ email: c.var.user.email }), // never null here
	);

app.onError(janusErrors()); // CREDENTIALS_INVALID → 401, STORE_FAILED → 503, …
```

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-hono @nxgt/janus hono
```

Every peer is required: `@nxgt/janus`, `hono` (4.13.4 or later) and
`typescript` (6). `@nxgt/janus` is a **peer**, never a dependency: this package
defines no error class, so the `JanusError` you catch is the one you import.
Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`: the
declarations import without extensions, so `nodenext` is not supported.

## API

| Export | What it is |
| --- | --- |
| `session(auth, options?)` | Middleware. Reads who the request belongs to — `auth.authenticate(c.req.raw)` — and sets `c.var.user` and `c.var.session`, `null` for an anonymous request. `{ required: true }` answers an anonymous request 401 and types `c.var.user` as never `null`. `{ type: 'staff' }` treats a user of any other type as anonymous. Sends a renewed session's cookie again |
| `sendSession(c, auth, signedIn)` | Appends the session cookie to the response — after `signUp`, `signIn`, or anything that answered `{ token, session, user }` — and answers the user |
| `signOut(c, auth)` | Revokes the session the request presents and clears the cookie, whatever the answer. `false` when the request presented no session, or an unknown one |
| `janusErrors({ report?, fallback? })` | An `app.onError` handler: every `JanusError` answered with `statusOf(code)` and `bodyOf(error)`; anything else to `fallback`, or to Hono's own handling. `report(error, c)` sees every one answered 5xx first — `STORE_FAILED` and the like, for your logs |
| `statusOf(code)` | The status a code deserves: `STORE_FAILED` 503, `CREDENTIALS_INVALID` 401, `USER_INACTIVE` 403, `LOGIN_TAKEN` 409, … Exhaustive over `JanusErrorCode` |
| `bodyOf(error)` | `{ code }`, plus `issues` for `USER_INVALID` and `minLength` for `PASSWORD_TOO_SHORT` — what the client can act on, and nothing else |
| `SessionOptions<Type>` | `{ type?, required? }`, the options of `session()` — for a wrapper of your own |
| `SessionEnv<typeof auth, Type?, Required?>` | The `Env` `session()` sets, for `new Hono<SessionEnv<typeof auth>>()` |
| `UserOfAuth<typeof auth>` | The users an instance knows, as a union narrowed by `user.type` |
| `permission(access, permission, type, load, options?)` | Middleware. Loads the object with `load(c)`, checks `access.can(c.var.user, permission, object)` with `type` added, and sets `c.var.object` to what `load` answered. Anonymous: 401, before loading. `load` answers `null`: 404. A denial: 403. `{ ctx: (c, object) => … }` is required exactly when the permission reaches a condition; `{ subject: (c) => … }` replaces `c.var.user`. One per route |
| `byParam(name, find)` | A `load` for `permission()`: `find(c.req.param(name))`, or `null` — a 404 — when the route has no such parameter |
| `bindJanus({ auth?, access? })` | The functions above with the instances bound: `session(options?)`, `sendSession(c, signedIn)` and `signOut(c)` with `auth`; `permission(permission, type, load, options?)` with `access`; `provide()` always |
| `provide({ auth?, access? })` | Middleware. Sets `c.var.auth` and `c.var.access` to the instances given — only those — for a route that writes users or tuples |
| `ObjectData<C, Type>`, `PermissionOptions`, `Instances` | The types of `load`'s answer, of `permission()`'s options and of `provide()`'s argument |

The whole status table is in [`@nxgt/janus`'s errors guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md).

## Permissions

`permission()` guards a route: the object is loaded once, checked, and handed
to the route. `provide()` puts the instances on the context, so the route that
creates a record grants its owner through `c.var.access`:

```ts
import { permission, provide, session } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { access, recordOf } from './access'; // the guide's model, and a loader
import { auth } from './auth';
import { records } from './records'; // your own store

const app = new Hono()
	.use(session(auth), provide({ auth, access }))
	.get(
		'/records/:id',
		permission(access, 'view', 'record', recordOf),
		(c) => c.json(c.var.object), // your record type, loaded once
	)
	.put(
		'/records/:id',
		permission(access, 'edit', 'record', recordOf, {
			ctx: (c, record) => ({ locked: record.locked }), // `edit` reaches a when()
		}),
		async (c) => c.json(await records.update(c.var.object.id, await c.req.json())),
	)
	.post('/records', session(auth, { type: 'patient', required: true }), async (c) => {
		const record = await records.create(await c.req.json());
		await c.var.access.grant({ type: 'record', id: record.id }, 'owner', c.var.user);
		return c.json(record, 201);
	});
```

The model — `owner`, a `doctor` read from the record, `edit` under a condition
— and `recordOf` are those of the [guarded routes guide](docs/guide/permissions.md). The
permission, the object type, the fields a `fromField` reads and the `ctx`
of a condition are typed from the model, as they are for `can()`.
`janusErrors()` answers the failures of both sides alike — `can()`'s
`STORE_FAILED` is a 503, never a 403.

### Bound once

`bindJanus({ auth, access })` answers the same functions with the instances
bound, so no route repeats them — typed exactly as the unbound ones:

```ts
import { bindJanus, byParam } from '@nxgt/janus-hono';

const j = bindJanus({ auth, access });

const app = new Hono()
	.use(j.session(), j.provide())
	.get('/records/:id', j.permission('view', 'record', byParam('id', (id) => records.find(id))), (c) =>
		c.json(c.var.object),
	)
	.post('/sign-out', async (c) => {
		await j.signOut(c);
		return c.body(null, 204);
	});
```

Only what is given is bound: `bindJanus({ auth })` has no `permission`.

Each side is usable alone. An application that signs users in some other way
passes `{ subject: (c) => … }` to `permission()`; one without permissions uses
`session()` and `janusErrors()` only.

## Traps

- **Without `app.onError(janusErrors())`, an outage is Hono's 500.** Not a
  401 — `session()` never turns a failure into an anonymous request — but not
  the 503 that tells a client to retry either.
- **`app.use(session(auth))` on its own line does not type the routes after
  it.** Hono types a chain, not statements. Chain the calls, or declare the app
  as `new Hono<SessionEnv<typeof auth>>()`.
- **A renewed session is sent again only as a cookie, and only to a request
  that presented one.** A client that sends `Authorization: Bearer` is renewed
  too — its session token does not change — but it is never handed a cookie it did not
  ask for. It reads `session.expiresAt` if it needs to.
- **`required` is typed only for a literal `true`.** A computed `boolean`
  compiles, and leaves `c.var.user` nullable.
- **`required` answers 401 with no body and no `WWW-Authenticate`.** Wrap the
  route yourself for another answer: `session(auth)`, then check
  `c.var.user === null`.
- **The cookie is `Secure` by default.** A browser drops it over plain
  `http://`, `localhost` aside in most browsers. Set `cookie: { secure: false }`
  in `janus()` for a development server that is not on `localhost`, never in
  production.
- **`janusErrors()` logs nothing by itself.** A `STORE_FAILED` is answered 503
  without a line in your logs unless you pass `report` —
  `janusErrors({ report: (error) => logger.error(error) })`.
- **`bodyOf` never carries `reason`, `login` or a cause.** `CREDENTIALS_INVALID`
  says one thing for an unknown login, a missing password and a wrong one, so a
  response cannot tell which users exist. Log the error before you answer it
  if you need the reason: `janusErrors` is a function of `(error, c)` you can
  wrap.
- **`load` does not know the route's path.** It takes a plain `Context`:
  `permission()` is built before Hono attaches it to a route, so
  `c.req.param('id')` is `string | undefined` there. Answer `null` for a
  missing id — that is a 404 — or let `byParam('id', find)` do it.
- **One `permission()` per route.** Both would claim `c.var.object`, so a
  second throws a `TypeError`. Check a parent object through an arrow in the
  model.
- **`permission()` needs `session()` before it**, or `{ subject }`. Without
  either, it throws a `TypeError` at the first request — a wiring error, not
  an anonymous 401.
- **A denial is 403, so it tells that the object exists.** Where that is a
  leak, load only what the user may see and let `load` answer `null` — a 404.

## Documentation

- [Guides](docs/README.md) — wiring the middleware, the routes of a sign-in, guarded routes
- [Troubleshooting](docs/troubleshooting.md) — by the symptom or message you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Twenty-two plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/`:

- six in `session.ts`: reading `c.var.user` where it may be `null` (twice,
  directly and through `SessionEnv`), a field of another user type, a user type
  the instance does not know (twice, in `session()` and in `SessionEnv`), and a
  cookie sent without its session;
- ten in `permission.ts`: a permission the object type does not declare, an
  object type the model does not (twice: in a model of one object type and of
  several, each reported on the misspelled argument), an object loaded without
  a field a `fromField` reads, a condition reached with no `ctx`, a `ctx` of the
  wrong shape, a `ctx` where no condition is reachable, a field the loaded
  object does not have, granting a relation read from a field, and an instance
  `provide()` was not given;
- six in `bind.ts`: the same refusals through `bindJanus()` — a nullable user,
  an unknown user type, a missing `ctx`, a misspelled permission — and a
  `permission` or a `session` it was not given the instance for.

## Licence

MIT
