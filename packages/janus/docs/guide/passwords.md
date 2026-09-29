# Password hashing

This page is for choosing a password hasher, moving from one to another,
importing hashes written by another system, and how `signIn` throttles
password guessing. The login and the length policy
are on the [users](users.md#options) page.

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

const User = z.object({ email: z.email() });
const store = createMemoryStores();

const auth = janus({
	user: User,
	password: { login: 'email' },
	store,
	hasher: scryptHasher(), // N = 2^17, r = 8, p = 1
});
```

The examples below reuse `User` and `store`.

A user type with a password and no `hasher` is refused at wiring with a
`TypeError`. There is no silent fallback.

## The two hashers

| Hasher | Runs on | Hash | Parameters |
| --- | --- | --- | --- |
| `scryptHasher({ cost? })` | Node and Bun, no dependency | `$scrypt$ln=17,r=8,p=1$<salt>$<key>` | OWASP's: `cost` is log2(N), `17` by default, `10` to `20`; about 128 MiB per hash |
| `bunHasher()` | Bun only, through `Bun.password` | `$argon2id$v=19$m=65536,t=2,p=1$…` | Pinned, so a change of default in a Bun release is not inherited silently |

`bunHasher()` throws a `TypeError` when called outside Bun; the package still
imports cleanly under Node, because nothing reads `Bun` until then.

Lower `cost` only in tests — `10` is fast and still exercises every line:

```ts
const hasher = scryptHasher({ cost: 10 });
```

## Hashes describe themselves

Every hash starts with its hasher's `prefix`, and carries its parameters. So
**every wired hasher can verify, and exactly one hashes**: `hasher` writes new
hashes, and `verifiers` only read the ones a database was written with before.

```ts
import { bunHasher, scryptHasher } from '@nxgt/janus';

const auth = janus({
	user: User,
	password: { login: 'email' },
	store,
	hasher: bunHasher(),          // new hashes: argon2id
	verifiers: [scryptHasher()],  // existing scrypt hashes still verify
});
```

Two hashers claiming the same prefix are refused at wiring: which one verified
would depend on the order they were listed in. A stored hash whose prefix no
wired hasher claims is `HASH_UNSUPPORTED` at sign-in, and the error reports
the prefix, never the hash.

## Rehash on sign-in

When a password matches a **stale** hash, `signIn` rewrites it with `hasher`.
A hash is stale when:

- a `verifiers` hasher wrote it, or
- `hasher` wrote it with other parameters than it uses now — a raised scrypt
  `cost`, or argon2id parameters other than the pinned ones.

Moving off a hasher, or raising its cost, therefore reaches every active user
with no migration to run. The password's `updatedAt` is kept, since the
password did not change; the user's `version` moves. The write is conditional
on the version just read: if a concurrent update wins, the sign-in still
succeeds and the next one tries again. An outage on that write fails the
sign-in with `STORE_FAILED`.

That `version` move is why a user object read **before** a sign-in, then passed
as `ifVersion`, can get `VERSION_CONFLICT`. Read the user again.

## Importing hashes from another system

A `PasswordHasher` is four members, and a verifier for a foreign format is a
small object:

```ts
interface PasswordHasher {
	readonly prefix: string;            // every hash it writes starts with this
	hash(plain: string): Promise<string>;
	verify(plain: string, hash: string): Promise<boolean>;
	needsRehash?(hash: string): boolean; // its own hash, written with outdated parameters
}
```

```ts
import { type PasswordHasher, scryptHasher } from '@nxgt/janus';

// Your bcrypt library's compare — bcryptjs's `compare`, for one.
declare function compareBcrypt(plain: string, hash: string): Promise<boolean>;

const legacyBcrypt: PasswordHasher = {
	prefix: '$2b$',
	hash: () => Promise.reject(new Error('bcrypt only verifies here')), // never called: it is not `hasher`
	verify: (plain, hash) => compareBcrypt(plain, hash),
};

const auth = janus({
	user: User,
	password: { login: 'email' },
	store,
	hasher: scryptHasher(),
	verifiers: [legacyBcrypt],
});
```

Write each imported user's hash as their `PasswordRecord` with your store's
`insertUser` — `janus()` has no call that takes a hash — and each one moves to
scrypt the first time they sign in. Wire one verifier
per prefix the old system wrote (`$2a$`, `$2b$`, `$2y$` for bcrypt).

## Password guessing is throttled

**`signIn` counts the passwords tried at each login, and past ten in a
15-minute window it refuses every one — the right password included — until
the window ends.** On by default. The refusal is the same `CREDENTIALS_INVALID`
as a wrong password, with `reason: 'throttled'` for your logs and
`retryAfter`, the seconds until the next window, for the client:

```ts
import { JanusError } from '@nxgt/janus';

try {
	return await auth.signIn({ email, password });
} catch (error) {
	if (error instanceof JanusError && error.code === 'CREDENTIALS_INVALID') {
		const headers = error.retryAfter === undefined
			? undefined
			: { 'retry-after': String(error.retryAfter) };
		return Response.json({ code: error.code, retryAfter: error.retryAfter }, { status: 401, headers });
	}
	throw error;
}
```

[`janusErrors()`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-hono/docs/guide/routes.md#sign-up-and-sign-in) in
`@nxgt/janus-hono` and `janusGraphQLError()` in `@nxgt/janus-graphql` do this
for you, `Retry-After` header included.

What it does, precisely:

- **Nothing locks.** The next window signs in: no number of wrong
  passwords blocks an account beyond its window. **But the right password is
  refused while the login is throttled**, so somebody who knows only a login
  can keep its password sign-in shut by trying ten passwords every window.
  That is the price of counting per login; limit per client address (below),
  and a [sign-in code](sign-in-code.md) or [link](magic-link.md), when you
  wire them, still opens the account: the throttle counts passwords, never
  e-mailed codes or links.
- **Per login, known or not.** A login nobody holds is counted as a
  registered one is — `unknownLogin` ten times, then `throttled` — so the
  throttle does not say which logins exist; an unknown login is still
  compared against a dummy hash, as before. The login is counted as
  [`password.normalize`](users.md#passwordnormalize) writes it, within its
  user type: `ADA@example.test` and `ada@example.test` share one count.
- **Counted before anything is compared**, by the store, in one write per
  attempt: of twenty passwords tried at once, exactly ten are compared. A
  throttled attempt compares nothing, so it costs no hashing either.
- **A sign-in that opens a session starts the count again** for that
  login: the right password of an active user — and, with a second factor
  active, only once its code or a recovery code opens the session. A
  password that only opens a challenge restarts nothing, so knowing the
  password buys no more than ten challenges per window.
- **The windows are fixed slices of the clock**, not sliding: ten attempts
  at the end of one window and ten at the start of the next are allowed.

Change the limit or the window, or turn it off — `SignInConfig` and
`SignInThrottleConfig` are the option's types, for a wrapper of your own:

```ts
janus({ ..., signIn: { throttle: { attempts: 5, window: '1h' } } });
janus({ ..., signIn: { throttle: false } }); // counts nothing: limit signIn yourself
```

### Where the counts live

In the tokens store, as `secondFactor` tokens that belong to no user: the
store needs no new method, and an adapter that passes the conformance suite
counts correctly. Each is named by a keyed hash of the login, never the login
— keyed by your `secondFactor` keys when you wire them, and by a fixed key
otherwise, which only keeps the login out of plain sight: a dump of the
tokens then tells which logins were tried, for a guessed list. Each expires
two windows after its window starts — half an hour by default — **Redis and MongoDB drop it then;
PostgreSQL keeps it** until something deletes it, and every login tried,
registered or not, adds a row per window. Schedule a delete with
`@nxgt/janus-drizzle`:

```sql
delete from tokens where expires_at < now() - interval '1 hour'; -- janus.tokens when your tables have a schema of their own
```

`tokens` has no index on `expires_at`, so the delete scans the table: add
`create index on tokens (expires_at)` in a migration of yours if it grows.

The key is your first `secondFactor` key: wiring
`secondFactor` for the first time, or putting a new key first, starts every
login's count again. **A Redis tokens store that is flushed, or evicts keys under
memory pressure, forgets them** and every count starts again: give Redis
`maxmemory-policy noeviction` (see `@nxgt/janus-redis`).

### When the store cannot count

`signIn` throws `STORE_FAILED` — answer 503. It never answers a refusal the
visitor could not have caused, and never lets a password through uncounted:
**the throttle fails closed**, so a tokens-store outage stops password
sign-ins as a users-store outage would. A sign-in whose password was right and
whose count could not start again also throws `STORE_FAILED`, before any
session is opened.

The store's round-trips are observable, as its latency is: a login that
signed in this window costs a few more probes than one nobody holds.

### What you still limit yourself

The throttle counts per login. It does not see:

- **One password tried against many logins** (password spraying), nor many
  logins from one client: limit `signIn` **per client address** in front of
  the call, with the limiter you already run.
- `changePassword`, which compares the current password too: limit it per
  user.
- `resetPassword.request`, `signInCode.request` and `magicLink.request`,
  which send e-mail: limit them per address.

```ts
if (!(await limiter.consume(`sign-in:${clientAddress}`))) {
	return new Response(null, { status: 429, headers: { 'retry-after': '900' } });
}
const signedIn = await auth.signIn({ email, password });
```

## What never happens

- The plain password is never stored, and never appears in an error message.
- The hash never reaches a `User` — `hasPassword` says whether there is one.
- `signIn` compares against a dummy hash when nobody holds the login, so the
  time taken does not reveal which users exist. The store's own latency
  still can, and that limit is stated rather than denied.

## See also

- [Users](users.md) — `signIn`, `setPassword`, `changePassword`
- [Errors](errors.md) — `CREDENTIALS_INVALID`, its `reason` and `retryAfter`
