# Sessions

This page is for everything after a user has signed in: finding who a request
belongs to, the session cookie, renewal, signing out, and testing expiry.
Signing up and signing in are on the [users](users.md) page.

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
your policy. `resetPassword.confirm` signs out everywhere on its own.

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
- [E-mail flows](email-flows.md) — verification and password reset
- [Errors](errors.md) — `STORE_FAILED`, `UNSUPPORTED` and the rest
