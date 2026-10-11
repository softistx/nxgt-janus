# Sessions

This page is for everything after a user has signed in: finding who a request
belongs to, the session cookie, renewal, signing out, and testing expiry.
Signing up and signing in are on the [users](users.md) page; signing in a
user your application proved itself — accepting an invitation — is
[below](#signing-in-on-your-own-proof--signinproven).

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

export async function me(request: Request): Promise<Response> {
	const current = await auth.authenticate(request);
	if (current === null) return new Response(null, { status: 401 });

	const headers = new Headers();
	if (current.renewed) {
		headers.set('Set-Cookie', auth.cookie.serialize(current.token, current.session));
	}
	return Response.json({ id: current.user.id, email: current.user.email }, { headers });
}
```

## `authenticate`

```ts
authenticate<T extends User['type'] = User['type']>(
	request: RequestLike,
	options?: { readonly type?: T },
): Promise<Authenticated<Extract<User, { type: T }>> | null>;

interface Authenticated<U> {
	readonly user: U;
	readonly session: Session;  // the stored session, without its token hash
	readonly token: string;     // the token the request presented
	readonly renewed: boolean;  // true when this call moved session.expiresAt
}
```

`request` is a `Request`, a `Headers`, anything with `headers` (a Node
`IncomingMessage`), or a plain header record:

```ts
await auth.authenticate(new Headers({ authorization: `Bearer ${token}` }));
await auth.authenticate({ 'x-session-token': token });
await auth.authenticate({ headers: { cookie: `janus-session=${token}` } });
```

It reads `Authorization: Bearer`, then `X-Session-Token`, then the cookie.
**The first session credential present wins, not the first valid one**: a client that
sends a lapsed bearer beside a live cookie is anonymous. An `Authorization`
header of another scheme (`Basic`) is not a session credential.

It answers `null` — anonymous — for no session credential, an unknown token, a lapsed
or revoked session, a user deleted or inactive, or a user of another type than
`options.type`:

```ts
const staff = await clinic.authenticate(request, { type: 'staff' }); // a patient's session → null
staff?.user.username; // typed as staff
```

**An outage is not anonymous.** When a store cannot answer, `authenticate`
rejects with `STORE_FAILED` — answer 503. A 401 would sign everybody out during
the outage and send them to a sign-in page that cannot work either:

```ts
import { StoreFailure } from '@nxgt/janus';

export async function guarded(request: Request): Promise<Response> {
	try {
		const current = await auth.authenticate(request);
		return current === null ? new Response(null, { status: 401 }) : Response.json(current.user);
	} catch (error) {
		if (error instanceof StoreFailure) return new Response(null, { status: 503 });
		throw error;
	}
}
```

## Lifespan and renewal

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `session.lifespan` | `Duration` | `'7d'` | How long a session lives from when it was opened or last renewed |
| `session.renewAfter` | `Duration \| false` | `'1d'` | Once this much has passed, `authenticate` moves `expiresAt` to a whole `lifespan` from now and answers `renewed: true`. `false`: a fixed lifespan |

A sliding session is written **at most once per `renewAfter`**, not on every
request. When `renewed` is `true`, send the cookie again — its `Expires` moved.
With several user types, each type has its own `session`.

Expiry is decided by the core on every read, not by the store: a store may
still hold a lapsed session, and `authenticate` answers it as anonymous.

**Renewal is not freshness.** `session.authenticatedAt` is when the session
last proved who it is — at the sign-in, or since by a
[step-up](step-up.md) — and renewal never moves it. A sensitive route checks
it with `assertFresh(session, '10m')`, which throws `STEP_UP_REQUIRED` for
an older one.

## The cookie

```ts
const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
	cookie: { name: 'sid', sameSite: 'strict', domain: 'example.com' },
});

const { session, token } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });

auth.cookie.name;                       // 'sid'
auth.cookie.serialize(token, session);  // 'sid=…; Expires=…; Path=/; Domain=example.com; HttpOnly; SameSite=Strict; Secure'
auth.cookie.clear();                    // the same cookie, expired
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | string | `'janus-session'` | A cookie-name token: no space, `;` or `=` |
| `domain` | string | none | `Domain=` |
| `path` | string | `'/'` | `Path=` |
| `sameSite` | `'lax' \| 'strict' \| 'none'` | `'lax'` | `SameSite=` |
| `secure` | boolean | `true` | `Secure`. `sameSite: 'none'` requires it |

`HttpOnly` is always set. The cookie methods are synchronous and write
nothing: they build a `Set-Cookie` value for you to send.

## Signing in and out

```ts
export async function signIn(request: Request): Promise<Response> {
	const { email, password } = (await request.json()) as { email: string; password: string };
	const { user, session, token } = await auth.signIn({ email, password });
	return Response.json(
		{ id: user.id, token }, // a native client keeps the token and sends it as a bearer
		{ headers: { 'Set-Cookie': auth.cookie.serialize(token, session) } },
	);
}

export async function signOut(request: Request): Promise<Response> {
	await auth.signOut(request); // false when the request presents no session, or an unknown one
	return new Response(null, { status: 204, headers: { 'Set-Cookie': auth.cookie.clear() } });
}
```

**With `secondFactor` configured, switch on `status` first.** A user whose
second factor is active gets a challenge from `signIn`, not a session — no
`token`, no `session` — and the destructuring above no longer compiles:

```ts
const result = await auth.signIn({ email, password });
if (result.status === 'secondFactor') {
	// keep result.challenge for the next request — never in a URL — and ask for a code
	return Response.json({ next: 'code' });
}
const { user, session, token } = result; // status 'signedIn': as above
```

`secondFactor.confirm(challenge, code)` then answers the same `SignedIn`, and
its session is sent the same way. See
[the second factor](second-factor.md#signing-in-switch-on-status).

**With `janus({ devices })`, a second cookie rides beside the session's.**
A sign-in given `{ device }` answers a `deviceToken` for the client to keep
in a long-lived cookie of its own, apart from the session cookie: it
outlives every session, and a sign-out leaves it, so the device stays
known. `auth.cookie` builds only the session cookie — see
[devices](devices.md#keeping-the-token-the-cookie) for the device cookie.

`signOutEverywhere(user, { except })` revokes every standing session of a
user, but the one named, and answers how many it revoked — "sign out
everywhere else". An `except` that names no session of theirs — an unknown
id, or anything that is not an id at all — keeps none: every session goes,
the current one included.

```ts
const current = await auth.authenticate(request);
if (current !== null) {
	await auth.signOutEverywhere(current.user, { except: current.session.id });
}
```

`changePassword` leaves other sessions open; call this after it when that is
your policy. `resetPassword.confirm` signs out everywhere on its own, and so
do `signInCode.confirm` and `magicLink.confirm` when they prove an e-mail
never verified, before opening their own session
([why](magic-link.md#an-account-someone-else-registered)).

## Signing in on your own proof — `signInProven`

Some sign-ins are proved by the application, not by janus: a person accepts
an invitation your server issued, and the token they followed is the proof.
`auth.<type>.signInProven(user, options?)` signs that user in and answers
what every other sign-in answers — a `SignedIn`, or a challenge when their
second factor is active.

```ts
signInProven(user: UserRef, options?: SignInOptions): Promise<SignInResult<User>>
// SignedIn<User> on a type that cannot have a second factor
```

**It checks no credential: your server carries the proof.** It is a
privileged call, like `setPassword`. Call it only right after verifying a
proof your server issued, and take the id from that proof's own record —
never from the request body, a query string, or a cookie the client wrote.
An id a visitor can choose signs that visitor in as anybody.

### Accepting an invitation

The recipe the call is made for. The invitation is yours: a random token,
stored hashed, used once, with an expiry — the same rules janus applies to
its own links.

```ts
import { createHash, randomBytes } from 'node:crypto';

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');

// Inviting: mail a link of yours to the address — nothing of janus's is sent.
export async function invite(email: string) {
	const token = randomBytes(32).toString('base64url');
	await invitations.insert({ hash: hash(token), email, expiresAt: inSevenDays() });
	await sendMail(email, `Join us: https://app.example/invitation?token=${token}`);
}

// Accepting — from the page's POST, never from the link's GET, which a mail scanner follows.
export async function accept(request: Request): Promise<Response> {
	const { token } = (await request.json()) as { token: string };
	// One conditional write: spent once, and only while it has not expired.
	const invitation = await invitations.spend(hash(String(token)), new Date());
	if (invitation === null) return Response.json({ code: 'INVITATION_INVALID' }, { status: 404 });

	// The address is the invitation's, never the request's. The person may already have an
	// account — findByEmail counts nothing, sends nothing — or gets one, with no password.
	const user =
		(await auth.findByEmail(invitation.email)) ??
		(await auth.create({ email: invitation.email, name: '' }));
	const result = await auth.signInProven(user, { device: deviceOf(request) });
	if (result.status === 'secondFactor') {
		// keep result.challenge for the next request — never in a URL — and ask for a code
		return Response.json({ next: 'code' });
	}
	return Response.json(
		{ id: result.user.id },
		{ headers: { 'Set-Cookie': auth.cookie.serialize(result.token, result.session) } },
	);
}
```

**`findByEmail` works on every type with an e-mail, password or not** —
since 0.21. A type with no password has no `findByLogin`, and must not
declare one just to be looked up: that would open the password and reset
flows on it. It answers whether an account exists, so call it only here,
after the invitation was verified, on the address the invitation holds
([users](users.md#finding-a-user-by-e-mail--findbyemail)).

**Before 0.20 this was `magicLink.request(email)` then `magicLink.confirm`,
at once — use `signInProven` instead.** `request` is counted against the
mail throttle per address, five per 10 minutes by default: anybody asking
five links for the invitee's address made the real acceptance answer
`MAIL_THROTTLED`, with a message about "the last one sent" when nothing had
been sent. `signInProven` counts nothing, sends nothing, and spends nothing:
a link or a code already in the person's inbox still works afterwards.

### What it does, and what it does not

- **The same ending as every sign-in.** A user whose second factor is active
  gets `{ status: 'secondFactor', challenge }` — the application's proof is
  a first factor — and `secondFactor.confirm` opens the session. Given a
  `device`, it answers `newDevice` and `deviceToken`, and sends
  `user.newDeviceSignedIn` for a device new to the user
  ([devices](devices.md)). `@nxgt/janus-telemetry` traces it as
  `janus.<type>.signInProven` and writes `janus.signIn` with
  `janus.signIn.proven: true`.
- **Refused as every sign-in refuses.** An inactive user is `USER_INACTIVE`;
  a malformed id, an unknown one, a deleted user or a user of another type
  is `NOT_FOUND`, as for `get` — never `null`, since a sign-in that found
  nobody must not be read past. Options that are not `{ device }` are a
  `TypeError`, as on every sign-in.
- **No e-mail proved.** `emailVerified` stays as it was: the call does not
  know your proof reached the inbox. Nothing is dropped either — unlike a
  first proof by link or code, the password and second factor stay.
- **No throttle.** Neither the mail throttle nor the sign-in throttle counts
  it, and it restarts neither: a login past its password attempts is still
  throttled for `signIn`. Limit your own acceptance route per client, as
  any route that redeems a token.
- **No route.** `@nxgt/janus-hono` and `@nxgt/janus-graphql` expose nothing
  for it: the proof is yours, so the route is yours.

## `collectExpired`

```ts
const removed: number = await auth.collectExpired();
```

Deletes lapsed sessions, for a store that keeps them. It rejects with
`UNSUPPORTED` when the sessions store does not implement the optional
`deleteExpiredSessions` — a store with its own TTL, such as
`@nxgt/janus-mongo`'s, does not. The reference store implements it.

## Testing expiry

`fixedClock` is shipped for this:

```ts
import { expect, it } from 'bun:test';
import { z } from 'zod';
import { createMemoryStores, fixedClock, janus, scryptHasher } from '@nxgt/janus';

it('lapses after seven days', async () => {
	const clock = fixedClock(Date.UTC(2026, 0, 1));
	const auth = janus({
		user: z.object({ email: z.email() }),
		password: { login: 'email' },
		store: createMemoryStores(),
		hasher: scryptHasher({ cost: 10 }), // fast in tests; keep the default in production
		clock,
	});
	const { token } = await auth.signUp({ email: 'ada@example.com', password: 'correct horse' });
	const bearer = { authorization: `Bearer ${token}` };

	clock.advance(8 * 24 * 60 * 60 * 1000);

	expect(await auth.authenticate(bearer)).toBeNull();
});
```

## What is stored

The token is 32 random bytes, handed back once in `SignedIn` and
`Authenticated`. The store holds only its `sha256`, so a dump of the store
cannot be replayed. `Session` is the stored record without that hash: `id`,
`userId`, `authenticatedAt`, `expiresAt`, `revokedAt`, `createdAt`.

## See also

- [Users](users.md) — `signUp`, `signIn`, the configuration
- [Signing in with an e-mailed link](magic-link.md) — when janus, not your application, proves the person
- [The second factor](second-factor.md) — the challenge `signIn` answers instead of a session
- [Step-up](step-up.md) — proving again who you are, and `assertFresh`
- [Devices](devices.md) — the device cookie beside the session cookie, and a sign-in from a new device
- [E-mail flows](email-flows.md) — verification and password reset
- [Errors](errors.md) — `STORE_FAILED`, `UNSUPPORTED` and the rest
