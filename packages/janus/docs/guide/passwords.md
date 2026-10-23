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
- **`changePassword` counts in the same budget.** Each call is one more
  password tried at the user's login, counted before `current` is compared
  (a user with no password too, so the answer does not tell them apart), so
  a caller holding a session cannot guess current passwords without limit.
  Past the limit it answers `CREDENTIALS_INVALID` with `reason: 'throttled'`
  and `retryAfter`, the right `current` included, and writes nothing. One
  budget per account: wrong guesses at `signIn` and at `changePassword` add
  up, and a change that is written starts the count again.
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
a store with no TTL keeps it** until `collectExpired()` deletes it (the
tokens store's optional `deleteExpiredTokens`), and every login tried,
registered or not, adds a row per window. Schedule `collectExpired()` on such
a store: `@nxgt/janus-drizzle` implements `deleteExpiredTokens` (since 0.9),
with an index on `expires_at` that its
[migration](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/migrations.md#to-09-an-index-on-tokensexpires_at)
adds. A store of your own implements the method, or its rows stay.

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
- `resetPassword.request`, `signInCode.request` and `magicLink.request`,
  which send e-mail — and their `prepare`: [the mail throttle](email-flows.md#requests-that-send-e-mail-are-throttled)
  counts them per address, but not per client. Limit them per client.

```ts
if (!(await limiter.consume(`sign-in:${clientAddress}`))) {
	return new Response(null, { status: 429, headers: { 'retry-after': '900' } });
}
const signedIn = await auth.signIn({ email, password });
```

## Resetting a password at the root of several types

`auth.resetPassword.confirm(token, password)` at the root of an instance with
several user types is for a page that follows a reset link without knowing the
user's type. A type's own `confirm` refuses a short password **before** it
spends the token, so the visitor keeps the link. At the root the type is only
known after the spend, so the rule that stands in for it is the **strictest
`minLength`** among the types with a password — a password type with no
e-mail counts too, since the root cannot tell; it can never be reset, but its
rule still applies at the root:

```ts
janus({
	users: {
		admin: { schema: Account, password: { login: 'email' } },                    // 8
		member: { schema: Account, password: { login: 'email', minLength: 12 } },   // 12
	},
	// ...
});

await auth.resetPassword.confirm(token, 'ten chars!');
// PASSWORD_TOO_SHORT, minLength 12, userType 'member' — the link is not spent
await auth.admin.resetPassword.confirm(token, 'ten chars!'); // an admin's own rule: accepted
```

- A refused password never costs the link. The hash is computed once, before
  the spend.
- A more lenient type sees the stricter rule at the root only. The two are the
  same when every type has the same `minLength`.
- `PASSWORD_TOO_SHORT` at the root reports the strictest `minLength`, and the
  `userType` of the type that set it. Show the message, not the type.
- When no type has both a password and an e-mail the root has no
  `resetPassword`.

## What never happens

- The plain password is never stored, and never appears in an error message.
- The hash never reaches a `User` — `hasPassword` says whether there is one.
- `signIn` compares against a dummy hash when nobody holds the login, so the
  time taken does not reveal which users exist. The store's own latency
  still can, and that limit is stated rather than denied. For a reset, a
  sign-in code or a link, `prepare` takes that latency off the visitor's
  request: it counts and looks nobody up, and `send()` does the rest in the
  background ([requests in two steps](email-flows.md#requests-in-two-steps)).

## See also

- [Users](users.md) — `signIn`, `setPassword`, `changePassword`
- [Errors](errors.md) — `CREDENTIALS_INVALID`, its `reason` and `retryAfter`
