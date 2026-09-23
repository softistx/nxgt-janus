# @nxgt/janus

Identities and permissions as an **embeddable** TypeScript library: your process,
your database, behind a port you can implement.

> **Pre-v0.1.** This entry point currently ships the vocabulary the two modules
> share — errors, subjects, pagination, time, ids. `./identities` and
> `./conformance` arrive next. A subpath appears in `exports` only once it
> exports something you should call, because a published entry point is a
> promise.

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

## Traps

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

**Fourteen plausible mistakes, fourteen refused at compile time — and one gap,
named.**

The list is `test/types/refusals.ts`: one `@ts-expect-error` per mistake,
typechecked and never run, alongside the shapes that must keep compiling. The
rule comes from `nxgt-data`, and so does the reason to distrust the claim without
the file — when it was last measured on `@nxgt/mongo`, *seven of twelve plausible
mistakes still compiled*. A count that goes down is a visible regression.

The gap, since a measurement that only reports wins is not a measurement:
`'30 m'` **satisfies `Duration`**, because TypeScript's `${number}` placeholder
tolerates trailing whitespace inside the number. `parseDuration` refuses it, and
`duration.spec.ts` asserts that. It is written down rather than omitted.

## Licence

MIT
