# Password hashing

This page is for choosing a password hasher, moving from one to another, and
importing hashes written by another system. The login and the length policy
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

## What never happens

- The plain password is never stored, and never appears in an error message.
- The hash never reaches a `User` — `hasPassword` says whether there is one.
- `signIn` compares against a dummy hash when nobody holds the login, so the
  time taken does not reveal which accounts exist. The store's own latency
  still can, and that limit is stated rather than denied.

## See also

- [Users](users.md) — `signIn`, `setPassword`, `changePassword`
- [Errors](errors.md) — `CREDENTIALS_INVALID` and its `reason`
