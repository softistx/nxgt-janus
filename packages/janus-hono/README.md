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
| `sendSession(c, auth, signedIn, options?)` | Appends the session cookie to the response — after `signUp`, `signIn`, `secondFactor.confirm`, `secondFactor.recover`, or anything that answered `{ token, session, user }` — and answers the user. When the answer carries a `deviceToken` — the sign-in was given a `device` — it appends the device cookie too, or sets it again for another `maxAge`; `options.device` is its `DeviceCookieOptions`. With a second factor configured, narrow `signIn`'s answer on `status` first |
| `deviceOf(c, options?)` | The device token the request's device cookie holds, or `null` when there is none or it is empty: what a sign-in takes as `device` — `auth.signIn(input, { device: deviceOf(c) })`. `options` are the `DeviceCookieOptions` given to `sendSession` |
| `DeviceCookieOptions` | The device cookie: `{ name?, domain?, path?, sameSite?, secure?, maxAge? }` — `'janus-device'`, none, `'/'`, `'Lax'`, `true` and 400 days (`34560000` seconds) by default. Always `HttpOnly`. `sameSite` is Hono's capitalised `'Lax' \| 'Strict' \| 'None'` |
| `DEVICE_COOKIE` | `'janus-device'`, the device cookie's default name |
| `SendSessionOptions` | `{ device? }`, the options of `sendSession` — for a wrapper of your own |
| `fresh(maxAge, { clock? })` | Middleware, after `session()`. The route runs only for a session that proved who it is less than `maxAge` ago — signed in, or confirmed since by `auth.stepUp.confirm`. An older one throws `STEP_UP_REQUIRED`, which `janusErrors()` answers 403; an anonymous request is 401 with no body. `clock` is the one given to `janus()`, in a spec |
| `signOut(c, auth)` | Revokes the session the request presents and clears the cookie, whatever the answer. `false` when the request presented no session, or an unknown one |
| `janusErrors({ report?, fallback? })` | An `app.onError` handler: every `JanusError` answered with `statusOf(code)` and `bodyOf(error)` — and a `Retry-After` header when it carries `retryAfter`, a throttled sign-in; anything else to `fallback`, or to Hono's own handling. `report(error, c)` sees every one answered 5xx first — `STORE_FAILED` and the like, for your logs — and cannot change the answer: one that throws or rejects is a warning, and the 503 is sent |
| `statusOf(code)` | The status a code deserves — `@nxgt/janus`'s `statusOf`, typed as Hono's `ContentfulStatusCode`: `STORE_FAILED` 503, `CREDENTIALS_INVALID` and `CODE_INVALID` 401, `USER_INACTIVE` and `STEP_UP_REQUIRED` 403, `LOGIN_TAKEN`, `SECOND_FACTOR_NOT_ENROLLED` and `SECOND_FACTOR_ACTIVE` 409, … Exhaustive over `JanusErrorCode` |
| `bodyOf(error)` | `{ code }`, plus `issues` for `USER_INVALID`, `minLength` for `PASSWORD_TOO_SHORT` and `attemptsLeft` for any `CODE_INVALID` that carries it — `secondFactor.confirm`'s, `secondFactor.recover`'s, `signInCode.confirm`'s and `stepUp.confirm`'s — and `retryAfter` for a `CREDENTIALS_INVALID` whose login is throttled: what the client can act on, and nothing else |
| `SessionOptions<Type>` | `{ type?, required? }`, the options of `session()` — for a wrapper of your own |
| `SessionEnv<typeof auth, Type?, Required?>` | The `Env` `session()` sets, for `new Hono<SessionEnv<typeof auth>>()` |
| `UserOfAuth<typeof auth>` | The users an instance knows, as a union narrowed by `user.type` |
| `permission(access, permission, type, load, options?)` | Middleware. Loads the object with `load(c)`, checks `access.can(c.var.user, permission, object)` with `type` added, and sets `c.var.object` to what `load` answered. Anonymous: 401, before loading. `load` answers `null`: 404. A denial: 403. `{ ctx: (c, object) => … }` is required exactly when the permission reaches a condition; `{ subject: (c) => … }` replaces `c.var.user`. One per route |
| `byParam(name, find)` | A `load` for `permission()`: `find(c.req.param(name))`, or `null` — a 404 — when the route has no such parameter |
| `bindJanus({ auth?, access? })` | The functions above with the instances bound: `session(options?)`, `sendSession(c, signedIn, options?)` and `signOut(c)` with `auth`; `permission(permission, type, load, options?)` with `access`; `provide()` always |
| `provide({ auth?, access? })` | Middleware. Sets `c.var.auth` and `c.var.access` to the instances given — only those — for a route that writes users or tuples |
| `ObjectData<C, Type>`, `PermissionOptions`, `Instances` | The types of `load`'s answer, of `permission()`'s options and of `provide()`'s argument |
| `FreshOptions` | `{ clock? }`, the options of `fresh()` |
| `JanusErrorsOptions` | `{ report?, fallback? }`, the options of `janusErrors()` — for a wrapper of your own |
| `Bound<I>` | What `bindJanus(instances)` answers, for `I` the type of `instances` — to pass a bound `j` to a module of routes |
| `Bindable` | What `bindJanus()` takes: `{ auth?, access? }`, the constraint on `Bound`'s `I` |
| `BoundAuth<typeof auth>` | The part of `Bound` that `auth` brings: `session`, `sendSession` and `signOut` |
| `BoundSession<typeof auth>` | `j.session`: `session(auth, options?)` with `auth` bound, typed as `session()` is — `{ required: true }` types `c.var.user` as never `null` |
| `BoundPermission<C>` | `j.permission`: `permission(access, …)` with `access` bound, for `C` the model's config: `ConfigOf<typeof model>` from `@nxgt/janus/permissions`, or take the whole type as `Bound<…>['permission']` |

The whole status table is in [`@nxgt/janus`'s errors guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md).

### A wrapper of your own

A wrapper around `janusErrors()` takes the same options, with your defaults:

```ts
import { type JanusErrorsOptions, janusErrors } from '@nxgt/janus-hono';
import { logger } from './logger'; // your own

export const appErrors = (options: JanusErrorsOptions = {}) =>
	janusErrors({ report: (error) => logger.error(error), ...options });

app.onError(appErrors());
```

## Second factor

With `janus({ secondFactor })`, `signIn` answers a session or a challenge.
Narrow on `status` before `sendSession`, keep the challenge in a cookie for
the code route, and let `confirm` open the session:

```ts
import { janusErrors, sendSession } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { auth } from './auth'; // janus({ …, secondFactor: { issuer, keys } })

const app = new Hono()
	.post('/sign-in', async (c) => {
		const result = await auth.signIn(await c.req.json());
		if (result.status === 'secondFactor') {
			setCookie(c, 'sign-in-challenge', result.challenge, {
				path: '/sign-in', httpOnly: true, secure: true, sameSite: 'Strict', expires: result.expiresAt,
			});
			return c.json({ next: 'code' });
		}
		return c.json({ id: sendSession(c, auth, result).id });
	})
	.post('/sign-in/code', async (c) => {
		const { code } = await c.req.json();
		const challenge = getCookie(c, 'sign-in-challenge') ?? '';
		const user = sendSession(c, auth, await auth.secondFactor.confirm(challenge, code));
		return c.json({ id: user.id });
	});

app.onError(janusErrors()); // a wrong code: 401 { code: 'CODE_INVALID', attemptsLeft: 3 }
```

`janusErrors()` answers `CODE_INVALID` 401 with `attemptsLeft` in the body,
`TOKEN_*` 400 — sign in again — and `SECOND_FACTOR_NOT_ENROLLED` and
`SECOND_FACTOR_ACTIVE` 409. The enrolment routes and a bearer client's
sign-in are in [the routes guide](docs/guide/routes.md#a-second-factor).

## Devices

With `janus({ devices })`, a sign-in given the device token the browser
holds tells a new device from a known one. `deviceOf(c)` reads the device
cookie, and `sendSession` sets it from the answer's `deviceToken`:

```ts
import { deviceOf, sendSession } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { auth } from './auth'; // janus({ …, devices: { keys } })

const app = new Hono().post('/sign-in', async (c) => {
	const { email, password } = await c.req.json();
	const signedIn = await auth.signIn({ email, password }, { device: deviceOf(c) });
	const user = sendSession(c, auth, signedIn); // the session cookie, and janus-device for 400 days
	if (signedIn.newDevice) await tellTheUser(user, c.req.header('user-agent')); // yours — @nxgt/janus-mail's newSignIn
	return c.json({ id: user.id });
});
```

The device cookie is `janus-device`, `HttpOnly`, `Secure`, `SameSite=Lax`,
`Path=/`, for 400 days; `{ device: { name, domain, path, sameSite, secure,
maxAge } }` changes it — give `deviceOf` the same options. With a second
factor, give `deviceOf(c)` again to `secondFactor.confirm` and `recover`:
the challenge carries no device. [The routes guide](docs/guide/routes.md#the-device-cookie)
has the second factor's routes and a bearer client.

## Step-up

A sensitive route asks for a recent proof: `fresh(maxAge)` after
`session()`. An older session is answered 403 `STEP_UP_REQUIRED`; the client
asks for a step-up, confirms it, and sends the request again:

```ts
import { fresh, janusErrors, session } from '@nxgt/janus-hono';
import { getCookie, setCookie } from 'hono/cookie';

const app = new Hono()
	.delete('/account', session(auth, { required: true }), fresh('10m'), deleteAccount)
	.post('/step-up', session(auth, { required: true }), async (c) => {
		const issued = await auth.stepUp.request(c.var.user);
		if (issued.via === 'email') await sendMail(issued.email, issued.code); // yours
		setCookie(c, 'step-up-challenge', issued.challenge, {
			path: '/step-up', httpOnly: true, secure: true, sameSite: 'Strict', expires: issued.expiresAt,
		});
		return c.json({ via: issued.via }); // 'secondFactor': ask for the app's code
	})
	.post('/step-up/code', session(auth, { required: true }), async (c) => {
		const { code } = await c.req.json();
		const challenge = getCookie(c, 'step-up-challenge') ?? '';
		await auth.stepUp.confirm(c.req.raw, challenge, code); // this request's session, fresh now
		return c.body(null, 204);
	});

app.onError(janusErrors()); // 403 { code: 'STEP_UP_REQUIRED' }, 401 { code: 'CODE_INVALID', attemptsLeft }
```

`confirm` stamps the session the request presents and opens none: there is
no cookie to send again. The whole flow is in
[the routes guide](docs/guide/routes.md#a-step-up).

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
		await c.var.access.grant({ type: 'record', id: record.id }, 'owners', c.var.user);
		return c.json(record, 201);
	});
```

The model — `owners`, `doctors` read from the record, `edit` under a condition
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

A module of routes that receives `j` types it `Bound<…>`, over the types of
the instances it was given:

```ts
import { type Bound, bindJanus, byParam } from '@nxgt/janus-hono';

export type Janus = Bound<{ auth: typeof auth; access: typeof access }>;

export const recordRoutes = (j: Janus) =>
	new Hono()
		.use(j.session(), j.provide())
		.get('/records/:id', j.permission('view', 'record', byParam('id', (id) => records.find(id))), (c) =>
			c.json(c.var.object), // typed, as with the unbound functions
		);

app.route('/', recordRoutes(bindJanus({ auth, access })));
```

Each side is usable alone. An application that signs users in some other way
passes `{ subject: (c) => … }` to `permission()`; one without permissions uses
`session()` and `janusErrors()` only.

## Traps

- **With a second factor, `sendSession(c, auth, await auth.signIn(…))` does
  not compile.** A challenge has no session to send. Narrow first:
  `if (result.status === 'secondFactor') …`.
- **A 401 is not always anonymous.** `session({ required: true })` answers
  401 with no body; a wrong second-factor code is 401 with
  `{ code: 'CODE_INVALID', attemptsLeft }`. Read the body before sending the
  visitor to the sign-in page.
- **A `janus()` without keys signing in a user with an active factor is a
  500.** It throws a `TypeError`, not a `JanusError`, so `janusErrors()`
  hands it to `fallback`. Give every instance the same `secondFactor`.
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
- **`bodyOf` never carries `reason`, `login`, a challenge or a cause.** `CREDENTIALS_INVALID`
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
- **`fresh()` needs `session()` before it**, as `permission()` does: without
  it, `fresh()` throws a `TypeError` at the first request. A 403
  `STEP_UP_REQUIRED` is not a denial — ask for a step-up, then retry.
- **`permission()` needs `session()` before it**, or `{ subject }`. Without
  either, it throws a `TypeError` at the first request — a wiring error, not
  an anonymous 401.
- **Give `deviceOf` and `sendSession` the same options.** A cookie written
  under one name or path and read under another is never found: every
  sign-in is then a new device. Keep one `DeviceCookieOptions` and pass it
  to both.
- **The device cookie's `sameSite` is Hono's, capitalised.** `'Lax'`, not
  the `'lax'` of `janus({ cookie })` — a compile error, where a cast would
  hand Hono a value it does not know.
- **`signOut` leaves the device cookie.** The device stays known after a
  sign-out, which is the point: a user who signs out and back in is not
  told of a new device.
- **With a second factor, give the device again.** `auth.secondFactor.confirm(challenge,
  code, { device: deviceOf(c) })`: the challenge carries none, and a
  confirmation given no device sets no device cookie and reports nothing.
- **A denial is 403, so it tells that the object exists.** Where that is a
  leak, load only what the user may see and let `load` answer `null` — a 404.

## Documentation

- [Guides](docs/README.md) — wiring the middleware, the routes of a sign-in, of a second factor, of a code or a link sent by e-mail and of the device cookie, guarded routes
- [Troubleshooting](docs/troubleshooting.md) — by the symptom or message you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Twenty-eight plausible mistakes are refused by the compiler, each with a
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
- nine in `bind.ts`: the same refusals through `bindJanus()` — a nullable
  user, an unknown user type, a missing `ctx`, a misspelled permission — a
  `permission`, `session`, `sendSession` or `signOut` it was not given the
  instance for, and an `access` that is no `permissions()` instance;
- one in `fresh.ts`: a `maxAge` that is no duration — `'10 minutes'` for
  `'10m'`;
- two in `device.ts`: the session cookie's lowercase `sameSite` given to the
  device cookie, whose `'Lax'` is Hono's, and the device cookie's options
  given to `sendSession` at the top rather than under `device`.

## Licence

MIT
