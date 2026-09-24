# @nxgt/janus

Authentication and permissions as an **embeddable** TypeScript library: your
process, your database, behind a port you can implement.

```ts
const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

const { user, token } = await auth.signUp({ email, name, password });
const current = await auth.authenticate(request); // { user, session } | null
```

> **Pre-v0.1.** `.` is `janus()` and the vocabulary it shares with the
> permissions — errors, subjects, pagination, time, ids. `./permissions` is the
> ReBAC engine. `./conformance` is the suite an adapter runs. A subpath appears in `exports`
> only once it exports something you should call, because a published entry
> point is a promise.

## Install

```sh
bun add @nxgt/janus
```

No runtime dependency. `typescript` is a peer. Your tsconfig resolves as a
bundler does (`"moduleResolution": "bundler"`, which Bun and every bundler
use): the declarations import without extensions, so `nodenext` is not
supported.

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
so no consumer has to order their `catch` blocks. `code` is a union of sixteen
string literals, so a `switch` over it is exhaustive and adding a code breaks the
compilation of callers that exhaust it:

| Code | Answer it deserves |
| --- | --- |
| `STORE_FAILED` | **503.** Never a negative answer |
| `NOT_FOUND` | 404 |
| `LOGIN_TAKEN`, `VERSION_CONFLICT` | 409 |
| `USER_INVALID` | 400, field by field from `issues` |
| `PASSWORD_TOO_SHORT`, `HASH_UNSUPPORTED` | 400 |
| `CREDENTIALS_INVALID` | 401 — one code for an unknown login, no password and a wrong one |
| `USER_INACTIVE` | 403 |
| `TOKEN_UNKNOWN`, `TOKEN_SPENT`, `TOKEN_EXPIRED`, `TOKEN_STALE` | 400 |
| `INVALID_CURSOR` | 400 |
| `UNSUPPORTED` | 500 — a wiring mistake, and the message names the store to change |
| `PERMISSION_DEPTH` | 500 — a permission check or list walked past `maxDepth`; not a denial |

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

subjectOf(user);                        // { type: 'staff', id: '…' }: the user IS the subject
formatTuple({
  object: { type: 'record', id: 'r1' },
  relation: 'viewer',
  subject: { type: 'team', id: 't1', relation: 'member' },
});
// 'record:r1#viewer@team:t1#member'
```

In Ory, the equality between a Kratos identity id and Keto's `subject_id` is a
comment and a convention, restated in three repositories and enforced nowhere.
Here it is a type and a one-line function — and that shared vocabulary is the
reason users and permissions are one package rather than two.

**Subjects are typed**, unlike Keto's: `{ type, id }` for one entity, and
`{ type, id, relation }` for a subject set. One application has patients and
staff, and an object can hold a relation too, so a bare id does not say who.
`type` is the same word as a user's own.

### Ids

```ts
import { mintId, isId, mintedAt } from '@nxgt/janus';
```

UUIDv7, **minted by the core and not by the store**. Ids sort in creation order
as strings, so the pagination cursor *is* the last id: one index, and the
ordering is already total. `insertUser` becomes idempotent under retry, and
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

### Users — `janus()`

```ts
import { z } from 'zod';
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';

// One kind of user
const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	store: createMemoryStores(),
	hasher: scryptHasher(),
});

await auth.signUp({ email, name, password });      // { user, session, token }
await auth.signIn({ email, password });            // { user, session, token }
await auth.authenticate(request);                  // { user, session, token, renewed } | null
await auth.signOut(request);
await auth.verifyEmail.send(user);                 // { token, email, expiresAt } — sending it is yours
await auth.verifyEmail.confirm(token);
await auth.resetPassword.request(email);           // … | null
await auth.resetPassword.confirm(token, newPassword);

// Several kinds of user
const clinic = janus({
	users: {
		patient: { schema: Patient, password: { login: 'email' } },
		staff: {
			schema: Staff,
			password: { login: 'username' },
			session: { lifespan: '8h', renewAfter: false },
		},
	},
	store,
	hasher,
});

await clinic.staff.signIn({ username, password });
const current = await clinic.authenticate(request);
if (current?.user.type === 'staff') current.user.service; // narrowed by type
await clinic.authenticate(request, { type: 'staff' });  // a patient's session → null
```

`janus()` assembles **synchronously and with no I/O**: it checks that every
store answers every method of the port, and connects to nothing. Everything
else reaches the store and is asynchronous.

- **A user is your schema's fields, at the top level**, plus what `janus` sets:
  `id`, `type`, `emailVerified`, `active`, `hasPassword`, `version`,
  `createdAt`, `updatedAt`. A schema declaring one of those, or a `password`, is
  refused at compile time. The password hash never reaches a user.
- **Schemas** are any [Standard Schema](https://standardschema.dev) — Zod 4,
  Valibot, ArkType. There is no validation peer. The output must be JSON, and a
  schema producing a `Date` is refused at compile time.
- **Several user types** live in one instance: `auth.patient.*`, `auth.staff.*`,
  and one `authenticate` whose answer is a union narrowed by `user.type`. A
  login is unique **per type**: the same e-mail may hold a patient account and
  a staff account.
- **`password.login`** names a top-level, required string field. A typo is a
  compile error on `login`, and the message lists the fields you could have
  meant. It is normalised with `'lowercaseTrim'` unless you say otherwise.
- **`email`** defaults to the field named `email`. A type without one has no
  `verifyEmail` and no `resetPassword` — they are absent from its type, not
  failing at run time. Changing the e-mail sets `emailVerified` back to `false`.
- **Per type**: `create`, `find` (or `null`), `get` (or `NOT_FOUND`), `list`,
  `update(user, patch)` — merged over the stored fields, then validated whole —
  `setActive` and `delete`; with a password, `signUp`, `signIn`, `findByLogin`,
  `setPassword` and `changePassword`. Every write but `delete` takes an
  optional `ifVersion`.
- **`delete(user)`** deletes the user together with every session and one-time
  token they had, so nothing of theirs is kept: a token holds the e-mail it was
  sent to. The user goes first, so an outage half-way leaves only sessions and
  tokens that authenticate nobody. It is idempotent, and calling it again
  finishes the job. It answers `false` for an unknown id, or for one of another
  type, and leaves that user untouched.
- **Shared**: `authenticate`, `signOut`, `signOutEverywhere(user, { except })`,
  `findUser` and `getUser` across types, `cookie.serialize(token, session)` and
  `cookie.clear()` — `HttpOnly; SameSite=Lax; Secure` unless you say otherwise
  — and `collectExpired`.
- **Sessions** last `'7d'` and slide: `authenticate` renews one once `renewAfter`
  (`'1d'`) has passed, writing at most once per period, and says so with
  `renewed`. The token is handed back once; the store only holds its `sha256`.

**Hashers.** `scryptHasher()` runs on Node and on Bun, with no dependency and
OWASP's parameters (N = 2^17, r = 8, p = 1). `bunHasher()` is argon2id through
`Bun.password`, on Bun only. There is no silent fallback: a user type with a
password and no `hasher` is refused at wiring. Hashes describe themselves
(`$scrypt$ln=17,r=8,p=1$…`, `$argon2id$…`). Wire the hashers a database was
written with as `verifiers`, and every one of them can verify while exactly one
hashes.

**Rehash on sign-in.** When a password matches a stale hash, `signIn` rewrites
it with `hasher`. A hash is stale when a `verifiers` hasher wrote it, or when
`hasher` wrote it with other parameters than it uses now: a raised scrypt
`cost`, or argon2id parameters other than the pinned `m=65536,t=2,p=1`. Moving
off a hasher, or raising its cost, therefore reaches every active user with no
migration to run. The password's `updatedAt` is kept, since the password did not
change; the user's `version` moves. The write happens only at the version just
read. If a concurrent update wins, the sign-in still succeeds and the next
sign-in tries again. An outage on that write still fails the sign-in.

**The port.** `JanusStores` is three stores — `users`, `sessions`, `tokens` —
cut where atomicity is not required, so sessions can live in Redis while users
live in MongoDB. `createMemoryStores()` is the reference implementation. It is
shipped for your own tests, and it is what to compare against when writing an
adapter. The six rules an adapter keeps are written on the port's types.

### Permissions — `@nxgt/janus/permissions`

```ts
import { defineModel, fromField, when, permissions, createMemoryRelations } from '@nxgt/janus/permissions';

export const model = defineModel({
	subjects: auth.types, // 'patient' | 'staff': a user type is a subject type
	types: {
		team: {
			relations: { member: ['staff', 'team#member'], lead: ['staff'] },
			permissions: { manage: ['lead'], view: ['member', 'manage'] },
		},
		record: {
			relations: {
				doctor: fromField('doctorId', 'staff', { lookup: (id) => db.records.ids({ doctorId: id }) }),
				team: ['team'],
			},
			permissions: {
				view: ['doctor', 'team->view'],
				edit: [when('doctor', (ctx: { onShift: boolean }) => ctx.onShift)],
			},
		},
	},
});

const access = permissions({ model, store: createMemoryRelations() });
await access.grant({ type: 'team', id: 't1' }, 'member', staff);
await access.can(staff, 'edit', { type: 'record', ...record }, { ctx: { onShift } }); // boolean
await access.list(staff, 'view', 'record', { ctx: { onShift }, limit: 50 });     // CursorPage<string>
```

Zanzibar's model — relations between objects and subjects, permissions
computed from them — **without its infrastructure**: the tuples live in your
database, so a read follows a write and there is nothing to cache or to
sequence. Subject sets (`'team#member'`), arrows (`'team->view'`: whoever can
view the record's team) and permissions naming permissions are Zanzibar's. Two
things are not:

- **`fromField`** reads a relation from the object's own data — a record's
  `doctorId` — instead of a tuple kept in sync with it. `can()` is given the
  object, and the compiler requires every field a `fromField` of its type
  reads. `list()` cannot read a field of objects it has not found, so it asks
  the `lookup`;
- **`when`** puts a condition written in TypeScript on a rule. Its `ctx` is
  what `can()` and `list()` then require — and only for the permissions whose
  rules reach it.

**A denial is `false`, a failure throws.** A relation store that cannot answer
is `STORE_FAILED`; a walk that crosses more than `maxDepth` relations (`25`) is
`PERMISSION_DEPTH`. Neither is ever `false`, which would deny everybody
everything during an outage and say nothing. A cycle in the data — a team
member of itself — is cut, and is not an error. `null` is anonymous: `false`,
or an empty page, before any store call.

**Everything is typed from the model.** A relation naming a type that does not
exist, a rule naming nothing, an arrow to a permission its target lacks, a
permission asked of the wrong type, an object missing a field, a missing
`ctx`, a `grant` of a relation read from a field or to a holder it does not
admit, a `list()` through a `fromField` without a `lookup`: each is a compile
error, on the offending argument. `defineModel` refuses with a `TypeError`
what only running it can see: names that are not camelCase, a permission that
reaches itself without crossing a relation, a subject set or an arrow that
would have to read another object's field.

**Wire the relation store into `janus()` too** — `janus({ …, relations })` —
and deleting a user deletes every tuple naming them. Deleting an object's
tuples is `store.deleteEntity({ type, id })`, from your own code.

The port is `RelationStore`: six methods answering one-hop questions about
stored tuples (`write`, `has`, `findSubjectSets`, `findEntities`,
`findObjects`, `deleteEntity`). The traversal is the core's, written once.

### Conformance — `@nxgt/janus/conformance`

If you write an adapter, you run this suite against it:

```ts
import { describe, it } from 'bun:test';
import { describeJanusStores } from '@nxgt/janus/conformance';

describeJanusStores({
	name: 'my adapter',
	runner: { describe, it },
	harness: {
		async open() {
			const db = await freshDatabase(); // one per case, never shared
			return {
				stores: myStores(db),
				faults: { fail: (slot, method) => db.failNext(method) },
				close: () => db.drop(),
			};
		},
	},
});
```

There are 37 cases. They cover:
- round-trip, byte for byte;
- uniqueness, as a constraint: of twenty concurrent inserts of one login,
  exactly one is accepted — and a login is unique per user type;
- versions: a refused update writes nothing;
- **omission**, named after the Kratos `PUT` trap;
- pagination;
- sessions;
- one-time tokens: of twenty concurrent redemptions, exactly one succeeds;
- deletion: a user's logins are freed, and every session and token of theirs
  goes, with a replay answering `false` or `0` rather than failing;
- **outages**, one case for each of the eleven methods whose honest answer can
  be "nothing".

The suite imports no test framework and no assertion library. It runs under
`bun test`, vitest and jest. Its cases are also exported as data
(`allCases`), with `runCase` to run one without any runner.

**`faults` is optional, and its absence is reported, never passed over.**
Without it, the outage cases are skipped under the reason *"the outage
invariant is not proven for this adapter"*. Make your database fail the way it
really fails — for MongoDB, the `failCommand` failpoint with code 91. A wrapper
that throws in front of your adapter proves the wrapper, not the adapter.

`referenceHarness()` runs the suite against the reference store, and is the
example to copy.

A relation store has its own suite, `describeRelationStores({ name, harness })`
— 15 cases: round-trip, a subject whose `relation` is `undefined` read as its
entity, absence, idempotent writes, a tuple stored once, the one-hop reads, the
reverse index in pages, `deleteEntity`, and an outage for each of the six
methods — a write that rejects must have changed nothing.
`referenceRelationHarness()` is its example.

## Traps

**The first session credential present wins, not the first valid one.**
`Authorization: Bearer`, then `X-Session-Token`, then the cookie. A client that
sends a lapsed bearer beside a live cookie is anonymous, and it should fix its
header rather than be rescued in silence.

**An outage is not anonymous.** `authenticate` rejects with `STORE_FAILED` when
the store cannot answer. Answer 503: a 401 would sign everybody out during an
outage, and send them to a sign-in page that cannot work either.

**Never put a `CREDENTIALS_INVALID`'s `reason` in a response body.**
`unknownLogin` is an account-enumeration oracle. `signIn` compares against a
dummy hash when nobody holds the login, so the hashing time does not tell.
**The store's own latency still does**, and that limit is stated rather than
denied. `resetPassword.request` answers `null` for an unknown e-mail for the
same reason: answer the visitor the same page either way.

**`resetPassword.confirm` signs the user out everywhere, and opens no session.**
Whoever had the old password loses their sessions; what the visitor does next is
your policy. A password refused for its length does not spend the token.

**A sign-in can move a user's `version`.** Rewriting a stale hash is a write. A
user object read before that sign-in, and then passed as `ifVersion`, gets
`VERSION_CONFLICT`. That is the conflict doing its job: read the user again.

**Expiry is decided by the core, not by the store.** A store may still hold a
lapsed session, and `authenticate` answers it as anonymous. A TTL index keeps
storage tidy; it is not the expiry mechanism.

**`update` merges, then validates the whole.** The patch is spread over the
stored fields and the result is checked against the schema, so a patch can
never leave a user that the schema would refuse. Pass `ifVersion` to make the
write conditional on what you read.

**Under `bun test`, pass `runner: { describe, it }`.** Measured: Bun gives a
test file `describe` and `it` as bare identifiers, not as properties of
`globalThis`. jest, and vitest with `globals: true`, are found without it.

**`undefined` is not an absence here.** Every method that can find nothing
answers `null`. `undefined` is what a missing property *and* a function with no
`return` both produce, so a store that forgot to answer would report "not found"
by accident. `null` has to be written on purpose.

**The notation is typed, and refuses Keto's untyped subject.**
`record:r1#viewer@staff:u1`, and `record:r1#viewer@team:t1#member` for a subject
set. No part may hold `@`, `#` or a parenthesis, and a type may not hold a `:`,
so every string reads one way. `parseTuple` refuses `record:r1#viewer@alice`,
and its message says what a subject is.

**`parseTuple` throws a bare `TypeError`, not a `JanusError`.** Nothing in this
package reads a tuple off the network, so a malformed string came from your own
code — a wiring mistake, and no handler should answer one.

**`mintedAt` is not `createdAt`.** The sequence may have borrowed a millisecond
and a clock that stepped backwards is held rather than followed, so it is
accurate to the millisecond and no further.

**`mintId(now)` steers ids forward, never back.** The last millisecond is
module state, so passing a `now` earlier than an id already minted in this
process does not produce an earlier id — it holds the last one and keeps counting,
because a decreasing id would break the pagination cursor, which is the whole
reason the core mints ids at all. A test that needs a fixed instant wants
`fixedClock`, not this argument.

**Error codes are `SCREAMING_SNAKE`, everything else is `camelCase`.** The codes
are data values, not keys. There is no `snake_case` key anywhere in this package,
unlike Ory — a Biome naming-convention rule holds it.

**`list()` costs what the subject can reach, every round.** It walks backwards
from the subject — every page of `findObjects` for every id each step reaches —
and repeats a round whenever a relation loops back on itself (a folder
viewable through its parent) until a round finds nothing new. Fine for what one
user can see; not for a subject set holding most of the database, which wants
a query of your own.

**`can()` wants the loaded object, spread.** `{ type: 'record', ...record }`: a
`fromField` reads its field there, and a field missing at run time is a
`TypeError`, never a denial. `null` in the field holds nobody.

**A `lookup` is your code, and not guarded.** A lookup that throws rejects
`list()` with its own error, as it threw. Never answer `[]` for a database that
could not answer: that is a denial made of an outage.

## Type safety, counted

**Seventy-five plausible mistakes, seventy-five refused at compile time — and
one gap, named.**

The lists are typechecked and never run, with one `@ts-expect-error` per
mistake beside the shapes that must keep compiling:
`test/types/refusals.ts` (fourteen, on the shared vocabulary),
`test/types/port.ts` (fifteen, on the store port, from the side of the person
implementing it), `test/types/auth.ts` (twenty, on `janus()`, from the side
of the application) and `test/types/permissions.ts` (twenty-six, on the
permission model and the questions asked of it). The rule
comes from `nxgt-data`, and so does the reason to
distrust the claim without the files: when it was last measured on
`@nxgt/mongo`, *seven of twelve plausible mistakes still compiled*. A count
that goes down is a visible regression.

The gap, since a measurement that only reports wins is not a measurement:
`'30 m'` **satisfies `Duration`**, because TypeScript's `${number}` placeholder
tolerates trailing whitespace inside the number. `parseDuration` refuses it, and
`duration.spec.ts` asserts that. It is written down rather than omitted.

## Licence

MIT
