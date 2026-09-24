# Troubleshooting `@nxgt/janus-hono`

Each entry is headed by what you see: a compiler error, or a status and its
body. Search this page for its words.

This package **defines no error class**. What reaches `app.onError` is one of
`@nxgt/janus`'s errors, and the codes are those of the core — see
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md)
for what causes each.

## Index

**Types**
- [`'c.var.user' is possibly 'null'`](#cvaruser-is-possibly-null)
- [`Property 'user' does not exist on type 'Readonly<ContextVariableMap>'`](#property-user-does-not-exist-on-type-readonlycontextvariablemap)
- [`Property 'email' does not exist on type 'User<"patient", …> | User<"staff", …>'`](#property-email-does-not-exist-on-type-userpatient---userstaff-)
- [`Type '"doctor"' is not assignable to type '"patient" | "staff"'`](#type-doctor-is-not-assignable-to-type-patient--staff)

**Runtime**
- [`500 Internal Server Error` for every refusal](#500-internal-server-error-for-every-refusal)
- [`401` with an empty body, for a signed-in user](#401-with-an-empty-body-for-a-signed-in-user)
- [`503 {"code":"STORE_FAILED"}` on every route](#503-codestore_failed-on-every-route)
- [`400 {"code":"HASH_UNSUPPORTED"}` on sign-in](#400-codehash_unsupported-on-sign-in)
- [The browser never sends the cookie back](#the-browser-never-sends-the-cookie-back)
- [A bearer client holds an expiry earlier than the session's](#a-bearer-client-holds-an-expiry-earlier-than-the-sessions)

## Types

### `'c.var.user' is possibly 'null'`

**When:** reading `c.var.user` in a route behind `session(auth)`.

**Why:** the route does not require a user, so an anonymous request reaches
it. The same holds for `required` given a computed `boolean`: only a literal
`true` removes the `null`.

**Fix:** require a user, or answer the anonymous request yourself.

```ts
app.get('/me', session(auth, { required: true }), (c) => c.json(c.var.user));
```

### `Property 'user' does not exist on type 'Readonly<ContextVariableMap>'`

**When:** `app.use(session(auth))` on its own line, then `c.var.user` in a
route declared after it.

**Why:** Hono types a chain of calls, not separate statements.

**Fix:** declare the app with the `Env`, or pass `session(auth)` to the route.

```ts
const app = new Hono<SessionEnv<typeof auth>>();
app.use(session(auth));
```

### `Property 'email' does not exist on type 'User<"patient", …> | User<"staff", …>'`

**When:** several user types, and `session(auth)` without `type`.

**Why:** the route admits every user type, so `c.var.user` is their union, and
a field only one type has is not on it.

**Fix:** name the type the route admits, or narrow on `user.type`.

```ts
app.get('/me', session(auth, { type: 'patient', required: true }), (c) =>
	c.json({ email: c.var.user.email }),
);
```

### `Type '"doctor"' is not assignable to type '"patient" | "staff"'`

**When:** `session(auth, { type: 'doctor' })`, or `SessionEnv<typeof auth, 'doctor'>`.

**Why:** `type` names a user type of the instance you pass, and `doctor` is
not one of them — a misspelling, or a type from another `janus()`.

**Fix:** use one of the names in the message, the keys of `users` in
`janus({ users })`.

## Runtime

### `500 Internal Server Error` for every refusal

**When:** a sign-in with a wrong password, a taken login or an outage answers
500 instead of 401, 409 or 503.

**Why:** no `janusErrors()` on the app that ran the throwing code. A sub-app's
own `onError` is captured when `app.route()` mounts it; one with none uses the
parent's. An error from a middleware on the parent — `app.use(session(auth))`
— always uses the parent's.

**Fix:** set it on the app you serve, and on a sub-app before mounting it if
that sub-app has a handler of its own.

```ts
app.onError(janusErrors());
sub.onError(janusErrors());
app.route('/staff', sub);
```

### `401` with an empty body, for a signed-in user

**When:** a route with `required: true` answers 401 although the user signed
in.

**Why**, in the order to check:

1. The route passes `type`, and the user is of another type. The session
   stands; it does not authenticate that user on this route.
2. The request presents two session credentials, and the first one is stale.
   **The first present wins, not the first valid one**: a lapsed
   `Authorization: Bearer` beside a live cookie is anonymous.
3. The session lapsed or was revoked — `signOut`, `signOutEverywhere`, a
   password reset — or the user was deactivated.
4. The browser did not send the cookie: see
   [The browser never sends the cookie back](#the-browser-never-sends-the-cookie-back).

**Fix:** for 2, stop sending the stale header. For 1 and 3, it is the answer
you asked for.

```ts
fetch(url, { credentials: 'include' }); // the cookie, and no stale Authorization header
```

### `503 {"code":"STORE_FAILED"}` on every route

**When:** every request that presents a session credential answers 503.

**Why:** a store cannot answer. `session()` calls the sessions store on every
request that presents a session token, and **an outage is never anonymous**: it
is `STORE_FAILED`, answered 503, so that nobody is told they are signed out
while the database is down. A request that presents nothing never reaches the
store, and stays anonymous.

**Fix:** the database. `janusErrors()` answers without logging: wrap it to see
which store failed and why.

```ts
const answer = janusErrors();
app.onError((error, c) => {
	if (error instanceof StoreFailure) {
		logger.error({ slot: error.slot, operation: error.operation }, error.cause);
	}
	return answer(error, c);
});
```

### `400 {"code":"HASH_UNSUPPORTED"}` on sign-in

**When:** users imported from another system, or after a change of hasher.

**Why:** the stored password hash has a prefix no wired hasher reads. It is a
wiring fault, not the user's: they cannot act on the 400.

**Fix:** wire the hasher that wrote those hashes back as a verifier — see
[`@nxgt/janus`'s passwords guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/passwords.md).

```ts
janus({ …, hasher: bunHasher(), verifiers: [scryptHasher()] }); // old hashes still verify
```

### The browser never sends the cookie back

**When:** `sendSession` answered a `Set-Cookie`, and the next request presents
no cookie.

**Why:** one of three.

- The cookie is `Secure` by default, and the page is served over plain
  `http://` on a host other than `localhost`.
- The front end is on another origin: the browser sends a cookie cross-origin
  only with `credentials: 'include'`, to a server that allows credentials, and
  `SameSite=Lax` (the default) drops it from a cross-site `POST`.
- `sameSite: 'none'` without `secure` is refused when `janus()` is called —
  `cookie.sameSite "none" requires cookie.secure` — so it never gets that far.

**Fix:** serve over HTTPS; for a development server off `localhost`,
`cookie: { secure: false }` in `janus()`, never in production. For a front end
on another origin:

```ts
import { cors } from 'hono/cors';

// janus({ …, cookie: { sameSite: 'none' } }) — secure stays true
app.use(cors({ origin: 'https://front.example', credentials: true }));
// in the front end: fetch(url, { credentials: 'include' })
```

### A bearer client holds an expiry earlier than the session's

**When:** a bearer client caches `session.expiresAt` from its sign-in, and
treats the session as over at that date.

**Why:** the session was renewed in passing, and its expiry moved in the store.
A bearer client is never sent a cookie saying so, and its session token does
not change.

**Fix:** nothing to fix unless the client caches the expiry. If it does, answer
`c.var.session.expiresAt` from a route it calls.

```ts
app.get('/session', session(auth, { required: true }), (c) =>
	c.json({ expiresAt: c.var.session.expiresAt }),
);
```
