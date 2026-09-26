# Troubleshooting `@nxgt/janus-hono`

Each entry is headed by what you see: a compiler error, a thrown `TypeError`,
or a status and its body. Search this page for its words.

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
- [`Argument of type 'string | undefined' is not assignable to parameter of type 'string'`, in `load`](#argument-of-type-string--undefined-is-not-assignable-to-parameter-of-type-string-in-load)
- [`Expected 5 arguments, but got 4`, on `permission()`](#expected-5-arguments-but-got-4-on-permission)
- [`Type '{ id: string; }' is not assignable to type 'Awaitable<ObjectData<…> | null>'`](#type--id-string--is-not-assignable-to-type-awaitableobjectdata--null)
- [`Property 'access' does not exist on type 'Readonly<ContextVariableMap & …>'`](#property-access-does-not-exist-on-type-readonlycontextvariablemap--)
- [`Argument of type 'SignInResult<…>' is not assignable to parameter of type …`, on `sendSession`](#argument-of-type-signinresult-is-not-assignable-to-parameter-of-type--readonly-token-string-readonly-session-session-readonly-user--)

**Runtime**
- [`500 Internal Server Error` for every refusal](#500-internal-server-error-for-every-refusal)
- [`TypeError: permission(): c.var.object is already set`](#typeerror-permission-cvarobject-is-already-set)
- [`TypeError: permission(): c.var.user is not set`](#typeerror-permission-cvaruser-is-not-set)
- [`403` where the user should be allowed](#403-where-the-user-should-be-allowed)
- [`401` with an empty body, for a signed-in user](#401-with-an-empty-body-for-a-signed-in-user)
- [`503 {"code":"STORE_FAILED"}` on every route](#503-codestore_failed-on-every-route)
- [`400 {"code":"HASH_UNSUPPORTED"}` on sign-in](#400-codehash_unsupported-on-sign-in)
- [`401 {"code":"CODE_INVALID","attemptsLeft":<n>}` on the code form](#401-codecode_invalidattemptsleftn-on-the-code-form) — a second factor's, or the code sent by e-mail
- [`409 {"code":"SECOND_FACTOR_ACTIVE"}` or `409 {"code":"SECOND_FACTOR_NOT_ENROLLED"}`](#409-codesecond_factor_active-or-409-codesecond_factor_not_enrolled)
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

### `Argument of type 'string | undefined' is not assignable to parameter of type 'string'`, in `load`

**When:** `permission(access, 'view', 'record', (c) => records.find(c.req.param('id')))`.

**Why:** `load` takes a plain `Context`: `permission()` is built before Hono
attaches it to a route, so `c.req.param('id')` is `string | undefined` there.

**Fix:** a missing id is nothing to load: answer `null`, which is a 404 —
what `byParam` does.

```ts
permission(access, 'view', 'record', byParam('id', (id) => records.find(id)));
```

### `Expected 5 arguments, but got 4`, on `permission()`

**When:** the permission reaches a `when()` condition, and no options were
passed.

**Why:** a condition needs its `ctx`, and `permission()` requires it exactly
then — as `can()` does.

**Fix:** pass `ctx`, read from the request and the loaded object.

```ts
permission(access, 'edit', 'record', load, {
	ctx: (c, record) => ({ locked: record.locked }),
});
```

### `Type '{ id: string; }' is not assignable to type 'Awaitable<ObjectData<…> | null>'`

Also: `Property 'doctorId' is missing in type '{ id: string; }'`.

**When:** `load` answers an object without a field a `fromField` of its type
reads — `doctorId` for `fromField('doctorId', 'staff')`.

**Why:** `can()` reads that relation from the object. At run time a missing
field is a `TypeError` — `can: record.doctors reads doctorId, which the object
does not carry …` — never a denial, so the type refuses it first.

**Fix:** load the field — `null` when it holds nobody.

### `Property 'access' does not exist on type 'Readonly<ContextVariableMap & …>'`

**When:** `c.var.access` or `c.var.auth` in a route. With nothing before the
route that sets a variable, the type is `'Readonly<ContextVariableMap>'`, with
no `&`.

**Why:** `provide()` was not in the chain before the route, or was not given
that instance: it sets, and types, only what it is given.

**Fix:**

```ts
const app = new Hono().use(session(auth), provide({ auth, access }));
```

### `Argument of type 'SignInResult<…>' is not assignable to parameter of type '{ readonly token: string; readonly session: Session; readonly user: … }'`

Also: `Type 'SecondFactorRequired' is missing the following properties …: token, session, user`.

**When:** `sendSession(c, auth, await auth.signIn(...))`, once `janus()` is
given a `secondFactor`.

**Why:** `signIn` then answers a session, or `{ status: 'secondFactor',
challenge, expiresAt }` for a user whose second factor is active — and a
challenge is no session to send.

**Fix:** switch on `status`, and send the session `secondFactor.confirm`
answers on the next request.

```ts
app.post('/sign-in', async (c) => {
	const result = await auth.signIn(await c.req.json());
	if (result.status === 'secondFactor') {
		// never in a URL: the body of the code form, or a short-lived cookie
		return c.json({ challenge: result.challenge, expiresAt: result.expiresAt });
	}
	return c.json(sendSession(c, auth, result));
});

app.post('/sign-in/code', async (c) => {
	const { challenge, code } = await c.req.json();
	return c.json(sendSession(c, auth, await auth.secondFactor.confirm(challenge, code)));
});
```

## Runtime

### `TypeError: permission(): c.var.object is already set`

**When:** the first request to a route with two `permission()` guards, or one
behind a middleware of yours that sets `c.var.object`.

**Why:** `permission()` hands the route its object as `c.var.object`. Two
would claim the one variable, and the route would be typed as if it held both.

**Fix:** one `permission()` per route. Check a parent through an arrow in the
model, so the one check covers it.

```ts
record: {
	related: { owners: ['patient'], folders: ['folder'] },
	permits: { view: ['owners', 'folders->view'] },
},
```

### `TypeError: permission(): c.var.user is not set`

**When:** the first request to a route guarded by `permission()`.

**Why:** nothing set `c.var.user`: no `session()` before `permission()` in that
route's chain, and no `subject` option. It is a wiring error, so it is thrown
rather than answered 401.

**Fix:** put `session(auth)` before it — on the route or with `app.use` — or
say who the subject is.

```ts
app.get('/records/:id', session(auth), permission(access, 'view', 'record', load), handler);
```

### `403` where the user should be allowed

**When:** a user who holds the relation is refused.

**Why**, in the order to check:

1. The user holds a relation, and the route asks a permission that does not
   include it — `edit` is not `view`.
2. A condition answered `false`: check what `ctx` computes.
3. A `fromField`'s field holds another id, or `null`, in what `load` answered.
4. The tuple names another user type than the one signed in — granted to
   `patient:u1`, checked for `staff:u1`: the same id under another type is
   somebody else.

**Fix:** ask `can()` directly with the same arguments; it answers the same.

```ts
await access.can(user, 'view', { ...record, type: 'record' }); // the check permission() makes
```

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

**Fix:** the database. `janusErrors()` answers without logging: pass `report`
to see which store failed and why.

```ts
app.onError(
	janusErrors({
		report: (error) =>
			logger.error({ slot: error.slot, operation: error.operation }, error.cause),
	}),
);
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

### `401 {"code":"CODE_INVALID","attemptsLeft":<n>}` on the code form

Also `401 {"code":"CODE_INVALID"}`, with no `attemptsLeft`, from
`secondFactor.activate`.

**When:** a route calling `secondFactor.confirm(challenge, code)` or
`secondFactor.activate(user, code)`, with a code that does not match or was
already used — or a route calling `signInCode.confirm(challenge, code)`, the
code sent by e-mail, with a code that does not match or is not six digits.

**Why:** `janusErrors()` answers a wrong code 401, like a wrong password. On
`confirm`, `attemptsLeft` is what the challenge has left of its five attempts;
at `0` it is spent, and the next call with it answers
`400 {"code":"TOKEN_SPENT"}`. If the code is the one the app shows, the cause
is a clock off by more than about 30 seconds, or a code used already — see
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#the-code-the-authenticator-app-shows-is-refused-with-code_invalid).

On `signInCode.confirm`, `attemptsLeft` counts the same five attempts, and
at `0` the challenge is spent too: the right code no longer works with it.

**Fix:** read `attemptsLeft` in the client: ask again while it is above `0`,
and go back to the sign-in form once it is `0`.

```ts
const response = await fetch('/sign-in/code', { method: 'POST', body: JSON.stringify({ challenge, code }) });
if (response.status === 401) {
	const { attemptsLeft } = await response.json();
	if (attemptsLeft === 0) showSignInForm();
	else showCodeForm(`Wrong code — ${attemptsLeft} attempts left`);
}
```

For the code sent by e-mail, request a new code once it is `0` — a new
challenge, with five attempts of its own:

```ts
const response = await fetch('/sign-in/email/code', { method: 'POST', body: JSON.stringify({ code }) });
if (response.status === 401) {
	const { attemptsLeft } = await response.json();
	if (attemptsLeft === 0) showEmailForm(); // POST /sign-in/email again: a new code
	else showCodeForm(`Wrong code — ${attemptsLeft} attempts left`);
}
```

### `409 {"code":"SECOND_FACTOR_ACTIVE"}` or `409 {"code":"SECOND_FACTOR_NOT_ENROLLED"}`

**When:** a route calling `secondFactor.enroll` or `secondFactor.activate`
answers `SECOND_FACTOR_ACTIVE` for a user whose factor is already on;
`secondFactor.activate` with no `enroll` before it, or `secondFactor.confirm`
after the factor was disabled, answers `SECOND_FACTOR_NOT_ENROLLED`.

**Why:** both say the factor is not in the state the call needs — a conflict
with the user's state, so 409, not 400. A `409 {"code":"VERSION_CONFLICT"}`
from the code form is the other 409: the same code submitted twice at once,
where the first call already opened the session.

**Fix:** read `c.var.user.hasSecondFactor` before offering "set up" or
"turn off"; after `SECOND_FACTOR_NOT_ENROLLED` on the code form, send the
visitor back to sign in. The causes of each are in
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md#second-factor).

```ts
app.post('/me/second-factor', session(auth, { required: true }), async (c) => {
	if (c.var.user.hasSecondFactor) return c.json({ active: true });
	return c.json(await auth.secondFactor.enroll(c.var.user)); // { secret, uri }
});
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
