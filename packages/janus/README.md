# @nxgt/janus

Identities and permissions as an **embeddable** TypeScript library: your process,
your database, behind a port you can implement.

> **Pre-v0.1.** `.` ships the vocabulary the two modules share — errors,
> subjects, pagination, time, ids — and `./identities` the identity core and
> its port. `./conformance` arrives next. A subpath appears in `exports` only
> once it exports something you should call, because a published entry point
> is a promise.

## Install

```sh
bun add @nxgt/janus
```

No runtime dependency. `typescript` is a peer.

## The one rule

**An absence is `null`. A failure throws.**

Everything else in this package is downstream of that sentence. A store that
cannot answer — a refused connection, a timeout, a primary stepping down, a bug
in the adapter — **throws**, and a caller answers 503. Mapping that to a 404, to
`null` or to `false` turns an outage into a silent lockout: everybody who has an
account is told they do not. That has been measured twice in this organisation,
two days apart, which is why it is a term of the port here rather than a note in
the documentation.

## API

### Errors

```ts
import { JanusError, StoreFailure, NotFoundError, type JanusErrorCode } from '@nxgt/janus';
```

`JanusError` is the base of everything thrown at call time. It extends `Error`,
so no consumer has to order their `catch` blocks. `code` is a union of fifteen
string literals, so a `switch` over it is exhaustive and adding a code breaks the
compilation of callers that exhaust it:

| Code | Answer it deserves |
| --- | --- |
| `STORE_FAILED` | **503.** Never a negative answer |
| `NOT_FOUND` | 404 |
| `IDENTIFIER_TAKEN`, `VERSION_CONFLICT` | 409 |
| `TRAITS_INVALID` | 400, field by field from `issues` |
| `PASSWORD_TOO_SHORT`, `HASH_UNSUPPORTED`, `CREDENTIAL_MISSING` | 400 or 401 — your policy |
| `IDENTITY_INACTIVE`, `AAL_REQUIRED` | 403 |
| `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED` | 400 |
| `INVALID_CURSOR` | 400 |
| `UNSUPPORTED` | 500 — a wiring mistake, and the message names the store to change |

`StoreFailure` and `StoreConflict` are exported **because an adapter throws
them**. An adapter defines no error class of its own, so `instanceof` holds
across the two packages.

**No message ever holds a secret** — not a password, not a hash, not a session
token, not a token's hash, and not a connection URI, because a connection string
holds a password. An `identifier` may appear in an `IDENTIFIER_TAKEN` message,
since the caller just sent it.

A refusal that can only come from how you wired the library — a lifespan that is
not a duration, a store missing a method — throws a bare `TypeError` instead. No
request handler should ever answer one, so no handler needs to tell it apart.

### Subjects

```ts
import { type Subject, subjectOf, formatTuple, parseTuple } from '@nxgt/janus';

subjectOf(identity);                    // the identity IS the subject
formatTuple({ namespace: 'Note', object: '1', relation: 'viewers', subject: 'alice' });
// 'Note:1#viewers@alice'
```

In Ory, the equality between a Kratos identity id and Keto's `subject_id` is a
comment and a convention, restated in three repositories and enforced nowhere.
Here it is a type and a one-line function — and that shared vocabulary is the
reason identities and permissions are one package rather than two.

### Ids

```ts
import { mintIdentityId, isIdentityId, mintedAt } from '@nxgt/janus';
```

UUIDv7, **minted by the core and not by the store**. Ids sort in creation order
as strings, so the pagination cursor *is* the last id: one index, and the
ordering is already total. `insertIdentity` becomes idempotent under retry, and
every adapter reports the same shape. The price, stated plainly: an adapter
cannot reuse an existing numeric primary key.

### Pagination and time

```ts
import { type CursorPage, pageLimit, systemClock, fixedClock, parseDuration } from '@nxgt/janus';
```

`CursorPage` has `items` and `nextCursor`, and **no `total`**: a count over a
cursor-paged collection is a second query whose answer is stale by the time you
read it. `nextCursor` is `string | null` with no `undefined`, so `while (cursor)`
is the loop.

`fixedClock` is **shipped, not test-only** — testing session expiry needs it, and
so do your own tests.

### Identities — `@nxgt/janus/identities`

```ts
import { z } from 'zod';
import {
	createIdentities,
	createMemoryStores,
	defineIdentities,
	scryptHasher,
} from '@nxgt/janus/identities';

const definition = defineIdentities({
	traits: z.strictObject({
		email: z.email(),
		name: z.object({ first: z.string(), last: z.string() }),
	}),
	identifiers: {
		password: { from: 'email', normalize: 'lowercaseTrim' },
	},
	verification: { from: 'email' },
	recovery: { from: 'email' },
	session: { lifespan: '720h', earliestRefresh: '24h' },
});

const identities = createIdentities(definition, createMemoryStores(), {
	hasher: scryptHasher(),
});
```

`defineIdentities` describes and touches nothing. `createIdentities` assembles,
**synchronously and with no I/O**: it checks that every store answers every
method of the port, and connects to nothing. Everything else reaches a store and
is asynchronous.

- **Traits** are any [Standard Schema](https://standardschema.dev) — Zod 4,
  Valibot, ArkType. There is no validation peer. The schema's output must be
  JSON, and a schema producing a `Date` is refused at compile time.
- **`identifiers.*.from`** names a *required string* trait, as a dotted path. A
  typo is a compile error on `from`, and the message lists the paths you could
  have meant.
- **`normalize` has no default.** `'none' | 'lowercase' | 'lowercaseTrim' |
  'nfkcLowercaseTrim'`, or a function. The core applies it before any store sees
  the value, so uniqueness is uniqueness of bytes.
- **Identities**: `create`, `find` (or `null`), `get` (or `NOT_FOUND`),
  `findByIdentifier`, `list`, `updateTraits` (the whole traits, validated),
  `setState`, `updateMetadata`, `setAddressVerified` (by value), `setPassword`,
  `removePassword`, `verifyPassword`. Every write takes an optional
  `ifVersion`: with it, one round trip; without it, the core reads first.
- **Sessions**: `sessions.create`, `resolve(headers)`, `extend`, `revoke`,
  `revokeAll(id, { except })`, `collectExpired`. The token is handed back
  **once**, and the store only ever holds its `sha256`.
- **One-time tokens**: `tokens.issue(kind, identityId, address)`,
  `consumeVerification`, `consumeRecovery`.
- `cookie.serialize(token, session)` and `cookie.clear()` produce `Set-Cookie`
  values — `HttpOnly; SameSite=Lax; Secure` unless you say otherwise.
  `requireAal(session, 'aal2')` refuses a session below that level.

**Hashers.** `scryptHasher()` runs on Node and on Bun, with no dependency and
OWASP's parameters (N = 2^17, r = 8, p = 1). `bunHasher()` is argon2id through
`Bun.password`, on Bun only. There is no silent fallback: a definition with a
password identifier and no `hasher` is refused at wiring. Hashes describe
themselves (`$scrypt$ln=17,r=8,p=1$…`, `$argon2id$…`). Wire the hashers a
database was written with as `verifiers`, and every one of them can verify while
exactly one hashes.

**The port.** `IdentityStores` is three stores — `identities`, `sessions`,
`tokens` — cut where atomicity is not required, so sessions can live in Redis
while identities live in MongoDB. `createMemoryStores()` is the reference
implementation. It is shipped for your own tests, and it is what to compare
against when writing an adapter. The six rules an adapter keeps are written on
the port's types.

## Traps

**The first session credential present wins, not the first valid one.**
`Authorization: Bearer`, then `X-Session-Token`, then the cookie. A client that
sends a lapsed bearer beside a live cookie is anonymous, and it should fix its
header rather than be rescued in silence.

**Never put `verifyPassword`'s `reason` in a response body.** `noSuchIdentity`
is an account-enumeration oracle. The core compares against a dummy hash when no
identity holds the identifier, so the hashing time does not tell. **The store's
own latency still does**, and that limit is stated rather than denied.

**`consumeRecovery` opens no session.** What a recovered account may do next is
your policy.

**Expiry is decided by the core, not by the store.** A store may still hold a
lapsed session, and `resolve` answers it as anonymous. A TTL index keeps storage
tidy; it is not the expiry mechanism.

**`updateTraits` takes the whole traits.** It does not take a partial: the core
validates the full object, so there is never a merge to get wrong. Read,
change, write — and pass `ifVersion` to make the write conditional.

**`undefined` is not an absence here.** Every method that can find nothing
answers `null`. `undefined` is what a missing property *and* a function with no
`return` both produce, so a store that forgot to answer would report "not found"
by accident. `null` has to be written on purpose.

**A subject set is parenthesised.** `Note:1#viewers@(Group:eng#members)`, where
Keto writes it bare. Without the parentheses a subject id containing a `:` or a
`#` is ambiguous, and a notation that cannot round-trip is a notation that lies
in a log. `parseSubject` refuses Keto's bare form with a message saying how to
write it.

**`parseTuple` throws a bare `TypeError`, not a `JanusError`.** Nothing in this
package reads a tuple off the network, so a malformed string came from your own
code — a wiring mistake, and no handler should answer one.

**`mintedAt` is not `createdAt`.** The sequence may have borrowed a millisecond
and a clock that stepped backwards is held rather than followed, so it is
accurate to the millisecond and no further.

**`mintIdentityId(now)` steers ids forward, never back.** The last millisecond is
module state, so passing a `now` earlier than an id already minted in this
process does not produce an earlier id — it holds the last one and keeps counting,
because a decreasing id would break the pagination cursor, which is the whole
reason the core mints ids at all. A test that needs a fixed instant wants
`fixedClock`, not this argument.

**Error codes are `SCREAMING_SNAKE`, everything else is `camelCase`.** The codes
are data values, not keys. There is no `snake_case` key anywhere in this package,
unlike Ory — a Biome naming-convention rule holds it.

## Type safety, counted

**Forty-nine plausible mistakes, forty-nine refused at compile time — and one
gap, named.**

The lists are typechecked and never run, with one `@ts-expect-error` per
mistake beside the shapes that must keep compiling:
`test/types/refusals.ts` (fourteen, on `.`), `test/types/port.ts` (fifteen, on
the store port, from the side of the person implementing it) and
`test/types/identities.ts` (twenty, on the identity core, from the side of the
application). The rule comes from `nxgt-data`, and so does the reason to
distrust the claim without the files: when it was last measured on
`@nxgt/mongo`, *seven of twelve plausible mistakes still compiled*. A count
that goes down is a visible regression.

The gap, since a measurement that only reports wins is not a measurement:
`'30 m'` **satisfies `Duration`**, because TypeScript's `${number}` placeholder
tolerates trailing whitespace inside the number. `parseDuration` refuses it, and
`duration.spec.ts` asserts that. It is written down rather than omitted.

## Licence

MIT
