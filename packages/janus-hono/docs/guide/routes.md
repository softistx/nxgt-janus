# The routes of an application

Every flow of `@nxgt/janus` as a Hono route. What this package adds is small on
purpose — who the request belongs to, the cookie, the statuses — so each route
below is `janus()`'s own call with Hono around it.

## Wiring

```ts
import { janusErrors, session } from '@nxgt/janus-hono';
import { Hono } from 'hono';
import { auth } from './auth';

export const app = new Hono();
app.onError(janusErrors());
```

`janusErrors()` is what turns a `JanusError` thrown anywhere — in a route, or
in `session()` — into its status. Without it, Hono answers 500 for all of
them. To log what the server must fix — every error answered 5xx, an outage
first — pass `report`; it runs before the answer:

```ts
app.onError(janusErrors({ report: (error) => logger.error(error) }));
```

To log every refusal too — why a sign-in failed, say — wrap it:

```ts
const answer = janusErrors();
app.onError((error, c) => {
	// `reason`, `login`, `slot`, `operation` and `cause` are here, never in the body
	logger.error(error);
	return answer(error, c);
});
```

`janusErrors({ fallback })` hands every other error to `fallback`; without one,
an `HTTPException` answers its own response and anything else is a logged
500, as Hono does by default.

### Binding the instances once

Every function of this package takes `auth` or `access` first.
`bindJanus()` binds them once — the same functions, the same types:

```ts
import { bindJanus } from '@nxgt/janus-hono';

export const j = bindJanus({ auth, access });

app.use(j.session(), j.provide());
app.get('/me', j.session({ required: true }), (c) => c.json(c.var.user));
app.post('/sign-in', async (c) => {
	const user = j.sendSession(c, await auth.signIn(await c.req.json()));
	return c.json({ id: user.id });
});
```

The rest of this guide writes the unbound form; each call reads the same with
`j.` and without its first argument.

## Who the request belongs to

```ts
app.get('/', session(auth), (c) =>
	c.text(c.var.user === null ? 'Hello' : `Hello ${c.var.user.name}`),
);

app.get('/account', session(auth, { required: true }), (c) =>
	c.json(c.var.user), // typed: never null
);
```

`session()` reads the session token the way `auth.authenticate` does —
`Authorization: Bearer`, then `X-Session-Token`, then the cookie, **the first
present wins** — and sets `c.var.user` and `c.var.session`.

| The request presents | `c.var.user` | With `required: true` |
| --- | --- | --- |
| Nothing | `null` | 401, no body; the route never runs |
| A lapsed, revoked or unknown session | `null` | 401 |
| A session of an inactive user, or of another type than `type` | `null` | 401 |
| A live session | the user | the user |
| A session credential, while the store cannot answer | — `STORE_FAILED` is thrown | — 503 through `janusErrors()` |

### For a whole app

Hono types a chain, so `app.use(session(auth))` on its own line leaves the
routes after it untyped. Declare the app with the `Env` instead:

```ts
import { type SessionEnv, session } from '@nxgt/janus-hono';

const app = new Hono<SessionEnv<typeof auth>>();
app.use(session(auth));
app.get('/', (c) => c.json({ signedIn: c.var.user !== null }));
```

An app whose every route requires a user of one type says so in both places,
and `c.var.user` is never `null` in it:

```ts
const rota = new Hono<SessionEnv<typeof auth, 'staff', true>>();
rota.use(session(auth, { type: 'staff', required: true }));
rota.get('/', (c) => c.json(rotaOf(c.var.user.username)));
```

### Renewal

Every session is renewed by `authenticate` in passing once `renewAfter` has
passed — `'1d'` by default, `false` for a fixed lifespan — and its expiry
moves. `session()` sends the cookie again after the route ran, with the
new `Expires` — to a request that presented the session as a cookie. A client
using `Authorization: Bearer` is renewed too, keeps its session token, and is never
handed a cookie. A route that sets the session cookie itself — `sendSession`
after a sign-in, `signOut` — keeps its own: the renewal is not sent over it.

## Sign-up and sign-in

```ts
import { sendSession } from '@nxgt/janus-hono';

app.post('/sign-up', async (c) => {
	const { email, name, password } = await c.req.json(); // validate the shape yourself
	const user = sendSession(c, auth, await auth.signUp({ email, name, password }));
	return c.json({ id: user.id }, 201);
});

app.post('/sign-in', async (c) => {
	const { email, password } = await c.req.json();
	const user = sendSession(c, auth, await auth.signIn({ email, password }));
	return c.json({ id: user.id });
});
```

`sendSession` answers the user it signed in, so a cookie client's route never
holds the session token: it is in the `Set-Cookie`, and the body cannot leak
it.

With `secondFactor` configured, `signIn` may answer a challenge instead of a
session: narrow on `status` before `sendSession` — see
[A second factor](#a-second-factor).

The refusals need no `try`: `janusErrors()` answers them.

| Thrown | Answered |
| --- | --- |
| `USER_INVALID` | 400 `{ code, issues }`, the fields that failed |
| `PASSWORD_TOO_SHORT` | 400 `{ code, minLength }` |
| `LOGIN_TAKEN` | 409 `{ code }` |
| `CREDENTIALS_INVALID` | 401 `{ code }` — the same for an unknown login and a wrong password |
| `USER_INACTIVE` | 403 `{ code }` — only told to somebody who gave the right password |

A bearer client — a mobile app — keeps its session token itself and sends it
as `Authorization: Bearer`. Answer it the session token in the body, not a
cookie — keep what `signIn` answered:

```ts
const signedIn = await auth.signIn({ email, password });
return c.json({
	id: signedIn.user.id,
	token: signedIn.token,
	expiresAt: signedIn.session.expiresAt,
});
```

## A second factor

With `janus({ secondFactor })`, `signIn` answers either a session or a
**challenge** — `{ status: 'secondFactor', challenge, expiresAt }` — and
`sendSession` only takes the first. **Narrow on `status` before
`sendSession`**: passing `signIn`'s answer straight in no longer compiles,
because a challenge has no `token` and no `session`.

```ts
import { sendSession } from '@nxgt/janus-hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';

const CHALLENGE = 'sign-in-challenge';
const scope = { path: '/sign-in', httpOnly: true, secure: true, sameSite: 'Strict' } as const;

app.post('/sign-in', async (c) => {
	const { email, password } = await c.req.json();
	const result = await auth.signIn({ email, password });
	if (result.status === 'secondFactor') {
		// the challenge is a secret: a cookie for the code route only, never a URL or a log
		setCookie(c, CHALLENGE, result.challenge, { ...scope, expires: result.expiresAt });
		return c.json({ next: 'code' });
	}
	const user = sendSession(c, auth, result);
	return c.json({ id: user.id });
});

app.post('/sign-in/code', async (c) => {
	const { code } = await c.req.json();
	const challenge = getCookie(c, CHALLENGE);
	if (challenge === undefined) return c.json({ code: 'TOKEN_UNKNOWN' }, 400);
	const user = sendSession(c, auth, await auth.secondFactor.confirm(challenge, code));
	deleteCookie(c, CHALLENGE, scope);
	return c.json({ id: user.id });
});
```

A wrong code leaves the cookie in place, so the visitor types the next one.
`janusErrors()` answers what `confirm` throws:

| Thrown | Answered |
| --- | --- |
| `CODE_INVALID` | 401 `{ code, attemptsLeft }` — the attempts the challenge has left, `0` once the fifth wrong code spent it |
| `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED` | 400 `{ code }` — send the visitor back to the password |
| `SECOND_FACTOR_NOT_ENROLLED` | 409 `{ code }` — the factor was disabled since `signIn`: sign in again |
| `USER_INACTIVE` | 403 `{ code }` |

`attemptsLeft` is the only thing the body adds: which cause of
`CODE_INVALID` it was — a wrong code or a reused one — is not told.

A bearer client gets the challenge in the body instead, and sends it back
with the code:

```ts
app.post('/api/sign-in', async (c) => {
	const result = await auth.signIn(await c.req.json());
	if (result.status === 'secondFactor') {
		return c.json({ challenge: result.challenge, expiresAt: result.expiresAt });
	}
	return c.json({ token: result.token, expiresAt: result.session.expiresAt });
});
```

### Enrolling, activating, disabling

The user is signed in for these, so `session()` names them:

```ts
app.post('/account/second-factor', session(auth, { required: true }), async (c) => {
	const { secret, uri } = await auth.secondFactor.enroll(c.var.user);
	c.header('Cache-Control', 'no-store'); // the secret is shown once, and never cached
	return c.json({ secret, uri }); // the page renders uri as a QR code
});

app.post('/account/second-factor/activate', session(auth, { required: true }), async (c) => {
	const { code } = await c.req.json();
	await auth.secondFactor.activate(c.var.user, code);
	return c.body(null, 204);
});

app.delete('/account/second-factor', session(auth, { required: true }), async (c) => {
	// your policy: a session opened in the last five minutes, so its holder just proved themselves
	if (Date.now() - c.var.session.authenticatedAt.getTime() > 5 * 60_000) {
		return c.json({ error: 'signInAgain' }, 403);
	}
	await auth.secondFactor.disable(c.var.user);
	return c.body(null, 204);
});
```

| Thrown | Answered |
| --- | --- |
| `SECOND_FACTOR_ACTIVE` | 409 `{ code }` — `enroll` or `activate` on a factor already active |
| `SECOND_FACTOR_NOT_ENROLLED` | 409 `{ code }` — `activate` before `enroll` |
| `CODE_INVALID` | 401 `{ code }` — `activate` counts no attempts, so there is no `attemptsLeft` |

The key rotation, the attempts and the replay rules are
[`@nxgt/janus`'s second factor guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/second-factor.md).

## Sign-out

```ts
import { signOut } from '@nxgt/janus-hono';

app.post('/sign-out', async (c) => {
	await signOut(c, auth);
	return c.body(null, 204);
});

app.post('/sign-out-everywhere', session(auth, { required: true }), async (c) => {
	await auth.signOutEverywhere(c.var.user, { except: c.var.session.id });
	return c.body(null, 204);
});
```

`signOut` clears the cookie whatever it revoked, so a browser holding a stale
cookie drops it too.

## E-mail verification and password reset

Sending the e-mail is yours; the one-time token goes in a link.

```ts
app.post('/verify-email', session(auth, { required: true }), async (c) => {
	const { token, email } = await auth.verifyEmail.send(c.var.user);
	await mailer.send(email, `https://app.test/verify?token=${token}`);
	return c.body(null, 202);
});

app.post('/verify-email/confirm', async (c) => {
	const { token } = await c.req.json();
	await auth.verifyEmail.confirm(token); // TOKEN_* → 400
	return c.body(null, 204);
});

app.post('/reset-password', async (c) => {
	const { email } = await c.req.json();
	const issued = await auth.resetPassword.request(email);
	if (issued !== null) {
		await mailer.send(issued.email, `https://app.test/reset?token=${issued.token}`);
	}
	return c.body(null, 202); // the same answer either way: never say which e-mails exist
});

app.post('/reset-password/confirm', async (c) => {
	const { token, password } = await c.req.json();
	await auth.resetPassword.confirm(token, password); // signs the user out everywhere
	return c.body(null, 204);
});
```

## Several user types

With `janus({ users: { patient, staff } })`, each type's flows are under its
name, and `session()` takes the type a route admits:

```ts
app.post('/staff/sign-in', async (c) => {
	const { username, password } = await c.req.json();
	sendSession(c, auth, await auth.staff.signIn({ username, password }));
	return c.body(null, 204);
});

app.get('/staff/rota', session(auth, { type: 'staff', required: true }), (c) =>
	c.json(rotaOf(c.var.user.username)), // a staff user: the compiler knows
);
```

A patient's session on `/staff/rota` is anonymous there, and answered 401. The
session stands, and still authenticates the patient on the routes that admit them.
One cookie holds one session: a browser signed in as a patient that signs in
as staff replaces the patient's cookie.

## See also

- [`@nxgt/janus` — sessions](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/sessions.md) — lifespans, renewal, the cookie's attributes
- [`@nxgt/janus` — errors](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/errors.md) — every code
- [`@nxgt/janus` — the second factor](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/guide/second-factor.md) — keys, states, attempts
- [Guarded routes and writing tuples](permissions.md) — `permission()`, `provide()`
- [Troubleshooting](../troubleshooting.md)
