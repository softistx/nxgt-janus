# @nxgt/janus-hono

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) in a
[Hono](https://hono.dev) app: the signed-in user on every request, the session
cookie set and cleared, and every error answered with the status it deserves —
an outage as 503, never as 401.

```ts
import { janusErrors, sendSession, session, signOut } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { auth } from './auth'; // what janus() answered

const app = new Hono()
	.post('/sign-in', async (c) => {
		const { email, password } = await c.req.json();
		const signedIn = await auth.signIn({ email, password });
		sendSession(c, auth, signedIn);
		return c.json({ id: signedIn.user.id });
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
| `sendSession(c, auth, signedIn)` | Appends the session cookie to the response — after `signUp`, `signIn`, or anything that answered `{ token, session }` |
| `signOut(c, auth)` | Revokes the session the request presents and clears the cookie, whatever the answer. `false` when the request presented no session, or an unknown one |
| `janusErrors(fallback?)` | An `app.onError` handler: every `JanusError` answered with `statusOf(code)` and `bodyOf(error)`; anything else to `fallback`, or to Hono's own handling |
| `statusOf(code)` | The status a code deserves: `STORE_FAILED` 503, `CREDENTIALS_INVALID` 401, `USER_INACTIVE` 403, `LOGIN_TAKEN` 409, … Exhaustive over `JanusErrorCode` |
| `bodyOf(error)` | `{ code }`, plus `issues` for `USER_INVALID` and `minLength` for `PASSWORD_TOO_SHORT` — what the client can act on, and nothing else |
| `SessionOptions<Type>` | `{ type?, required? }`, the options of `session()` — for a wrapper of your own |
| `SessionEnv<typeof auth, Type?, Required?>` | The `Env` `session()` sets, for `new Hono<SessionEnv<typeof auth>>()` |
| `UserOfAuth<typeof auth>` | The users an instance knows, as a union narrowed by `user.type` |

The whole status table is in [`@nxgt/janus`'s errors guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md).

## Either side

The permissions side needs no middleware: call `can()` in the route, where the
object is loaded, and answer a denial yourself. `janusErrors()` answers the
failures of both sides alike — `can()`'s `STORE_FAILED` is a 503, never a 403:

```ts
app.get('/records/:id', session(auth, { required: true }), async (c) => {
	const record = await records.find(c.req.param('id'));
	if (record === null) return c.body(null, 404);
	if (!(await access.can(c.var.user, 'view', { type: 'record', ...record }))) {
		return c.body(null, 403); // a denial is false, and yours to answer
	}
	return c.json(record);
});
```

An application that signs users in some other way uses `janusErrors()` alone.

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
- **`janusErrors()` logs nothing.** A `STORE_FAILED` is answered 503 without a
  line in your logs; wrap the handler to see which store failed — the
  [guide](docs/guide/routes.md#wiring) shows how.
- **`bodyOf` never carries `reason`, `login` or a cause.** `CREDENTIALS_INVALID`
  says one thing for an unknown login, a missing password and a wrong one, so a
  response cannot tell which users exist. Log the error before you answer it
  if you need the reason: `janusErrors` is a function of `(error, c)` you can
  wrap.

## Documentation

- [Guides](docs/README.md) — wiring the middleware, the routes of a sign-in
- [Troubleshooting](docs/troubleshooting.md) — by the symptom or message you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned

## Type safety, counted

Six plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/session.ts`: reading `c.var.user` where
it may be `null` (twice, directly and through `SessionEnv`), a field of another
user type, a user type the instance does not know (twice, in `session()` and in
`SessionEnv`), and a cookie sent without its session.

## Licence

MIT
