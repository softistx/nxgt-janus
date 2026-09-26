# The shared vocabulary

This page defines the words the documentation uses, then the small pieces
`@nxgt/janus` exports for both sides: subjects and the tuple notation, ids,
pagination, durations and clocks. All of it is imported from `@nxgt/janus`.

```ts
import { formatTuple, mintId, parseDuration, subjectOf } from '@nxgt/janus';

const user = { type: 'staff', id: mintId(), username: 'grace' };

subjectOf(user); // { type: 'staff', id: '…' }: the user IS the subject
formatTuple({
	object: { type: 'record', id: 'r1' },
	relation: 'teams',
	subject: { type: 'team', id: 't1' },
}); // 'record:r1#teams@team:t1'
parseDuration('8h', 'session.lifespan'); // 28800000
```

## Words

One word per idea, the same in the README, these guides, the error messages
and the code. The **Not** column lists the words it replaces, so a search for
either finds this row.

### The two sides

| Word | Means | Not |
| --- | --- | --- |
| **side** | One of the two things Janus does, each usable alone: identities or permissions | "half", "module" |
| **identities** | The side that answers *who is this?* — users, logins, passwords, sessions, one-time tokens. `janus()`, from `@nxgt/janus` | "auth", "authentication", in prose; `auth` is only the variable name in examples |
| **permissions** | The side that answers *may they?* — a model, the tuples stored against it, `can`, `list`, `grant`, `revoke`. `@nxgt/janus/permissions` | "authorization", "access control", "ACL" |

### Identities

| Word | Means | Not |
| --- | --- | --- |
| **user** | One stored person or machine, of one user type | "account" — kept only in *account takeover* and *account enumeration*, the names of those attacks |
| **user type** | A kind of user with its own schema and login: `staff`, `patient`. Wired to permissions, its name is a subject type — and may also be an object type, whose users are then objects too | "role": a role is a relation in the model |
| **schema** | A user type's Standard Schema: the fields a user carries | the model |
| **login** | The value a user signs in with: an e-mail, a username. **sign in** is the verb, **sign-in** the noun | "identifier" |
| **credential** | What a caller presents to prove who they are: a login and a password at sign-in (`CredentialError`, `CREDENTIALS_INVALID`), or a token on a request — always written *session credential* | |
| **password policy** | The rules a new password must meet: `minLength`, `normalize` | the model |
| **session** | A signed-in period, carried by a **session token** | |
| **lapsed**, **revoked**, **renewed** | A session past its `expiresAt`; one ended by a sign-out or a password reset; one whose `expiresAt` moved in passing (`renewAfter`) | "expired" — kept for `TOKEN_EXPIRED`, a one-time token |
| **anonymous** | A request that presents no session credential, or one that authenticates nobody: `authenticate` answers `null` | "unauthenticated", "guest", "logged out" |
| **bearer client** | A client that sends its session token as `Authorization: Bearer` rather than in a cookie | |
| **one-time token** | A single-use token sent by e-mail, for verification or a password reset | "code" alone — `code` is an error's code |
| **one-time code** | Planned, see [the roadmap](../roadmap.md#next): a one-time token short enough to type, sent by e-mail — or, for TOTP, computed by an authenticator app and never sent | "OTP", "PIN", "code" alone |
| **token** | Never alone in prose: a *session token* or a *one-time token*. The `tokens` store and the `TOKEN_*` codes are one-time tokens only | |
| **e-mail flow** | `verifyEmail` or `resetPassword`: send a one-time token, then confirm it | |

### Permissions

| Word | Means | Not |
| --- | --- | --- |
| **model** | What `defineModel()` answers: the subject types, the object types, their relations and permissions | "schema", "policy" |
| **subject type** | A name listed in `subjects`: `auth.types` when wired to `janus()`, your own names otherwise | |
| **object** | What a permission is about: `{ type: 'document', id }`, or a user whose type the model also declares under `types` | "resource" |
| **subject** | Who a permission is about: a user, an object, or a subject set | "principal", "actor" |
| **entity** | `{ type, id }`: a user or an object — a subject that is not a set (`Entity`, `deleteEntity`) | |
| **subject set** | Everyone holding one relation on one object: `team:t1#members`. On a user type the model also declares as an object type, only `setOf()` makes one | "group" — a group is an object with a `members` relation |
| **`setOf`** | The function that makes a subject set from a user or an object and a relation: `setOf(bob, 'managers')`. What it answers is a `SetOf`, and `isSetOf` tells it from a user | |
| **relation** | A named link, stored as tuples or read from a field (`fromField`). Declared under `related`, named in the plural: `members`, `doctors` | |
| **`related`** | The key of an object type that declares its relations: `related: { members: ['staff'] }`. It was `relations` before 0.2, and the old key is refused | "relations" as a key — the word stays for the idea, and for `janus({ relations })` |
| **holder** | What a relation admits: `'staff'`, or the subject set `'team#members'` | |
| **permission** | A name computed from relations and other permissions by its rules. Declared under `permits` | |
| **`permits`** | The key of an object type that declares its permissions, each a list of rules: `permits: { view: ['members'] }`. It was `permissions` before 0.2, and the old key is refused | "permissions" as a key — the word stays for the idea, and for `permissions()` |
| **rule** | One entry of a permission: a relation, another permission, an arrow, or one of them under a condition | |
| **arrow** | A rule that follows a relation to another object's permission or relation: `'teams->view'` | |
| **condition** | A predicate on a rule, written with `when`, run on the `ctx` passed to `can()` and `list()` | |
| **tuple** | One stored fact — object, relation, subject: `team:t1#members@staff:u1` | "grant", "ACL entry" |
| **guarded route** | A route that runs only when its subject holds a permission on the object it serves — `permission()` in `@nxgt/janus-hono` | |

### Stores

| Word | Means | Not |
| --- | --- | --- |
| **store** | Where a side keeps its data, behind a port. The **identity stores** are `users`, `sessions` and `tokens`; the **relation store** holds the tuples | "database", "repository" |
| **port** | The interface a store implements: `JanusStores` for the identity stores — named after the package, not the side — and `RelationStore` | "driver" |
| **adapter** | A package implementing the ports for one database: `@nxgt/janus-mongo`, `@nxgt/janus-drizzle`, `@nxgt/janus-redis`. What its `create…Adapter(db)` answers is its stores, keyed as `janus()` takes them — `{ store, relations }` | "plugin", "connector" |
| **integration** | A package fitting Janus into one web framework or one observability library: `@nxgt/janus-hono`, `@nxgt/janus-telemetry`. It implements no port | "plugin", "adapter" |
| **kit** | A package that opens the connections and wires adapters and integrations into one object for an application: `@nxgt/janus-kit`'s `connectKit` answers `{ auth, access, db, redis, ping, close }`. It implements no port, and `janus()` and `permissions()` are still written by the application | "framework", "starter" |

### Answers

The words of [the one rule](../../README.md#the-one-rule): each is a different
answer, and none stands in for another.

| Word | Means |
| --- | --- |
| **absence** | Nothing there: `null`, `[]`, an empty page, `0` |
| **denial** | A permission not held: `false` |
| **failure** | A store that could not answer — an **outage**. It throws `STORE_FAILED`: never an absence, never a denial |
| **refusal** | Anything thrown: a `JanusError` at call time — a taken login, a wrong password, a failure — or a `TypeError` at wiring time, from how the library was called. See [Two kinds of refusal](errors.md#two-kinds-of-refusal) |

## Subjects and the tuple notation

```ts
interface Entity { readonly type: string; readonly id: string }
interface SubjectSet extends Entity { readonly relation: string } // every `relation` of an entity
type Subject = Entity | SubjectSet;
interface RelationTuple { readonly object: Entity; readonly relation: string; readonly subject: Subject }
```

**Subjects are typed**: `{ type, id }` for one entity, `{ type, id, relation }`
for a subject set — everyone holding `members` on `team:t1`. `type` is the same word as a
user's own, so a user id and a subject id are the same thing, and
`subjectOf(user)` is the one-line join between the two sides of the package.
It copies `type` and `id` only, so none of the user's own fields ever reaches
a tuple.

| Function | Answers |
| --- | --- |
| `subjectOf(user)` | `{ type, id }` of any object carrying both |
| `isSubjectSet(subject)` | whether `relation` is a string |
| `formatEntity(entity)` | `'record:r1'` |
| `formatSubject(subject)` | `'staff:u1'`, or `'team:t1#members'` |
| `formatTuple(tuple)` | `'team:t1#members@team:t2#members'` |
| `parseSubject(text)` | the `Subject` back |
| `parseTuple(text)` | the `RelationTuple` back |

```ts
import { isSubjectSet, parseSubject, parseTuple } from '@nxgt/janus';

parseTuple('team:t1#members@staff:u1');
// { object: { type: 'team', id: 't1' }, relation: 'members', subject: { type: 'staff', id: 'u1' } }

const subject = parseSubject('team:t1#members');
if (isSubjectSet(subject)) subject.relation; // 'members'
```

The notation is for messages, logs and tests, not a wire format. No part may
hold `@`, `#` or a parenthesis, and a type may not hold a `:`, so every string
reads one way. `parseTuple` and `parseSubject` refuse anything else with a
**bare `TypeError`** — including Keto's untyped subject, `team:t1#members@grace`,
and the message says what a subject is. Nothing in this package reads a tuple
off the network, so a malformed string came from your own code.

## Ids

```ts
import { type Id, isId, mintedAt, mintId } from '@nxgt/janus';

const id: Id = mintId(); // a UUIDv7
isId(id);                // true
isId('42');              // false: not an id this package could have minted
mintedAt(id);            // the Date it was minted, to the millisecond
```

Ids are **minted by the core, not by the store**. They sort in creation order
as strings, so a pagination cursor is simply the last id of a page. Ids are
strictly increasing within a process: inside one millisecond a sequence orders
them, and past 4096 in a millisecond the next millisecond is borrowed.

- **`mintedAt` is not `createdAt`.** A borrowed millisecond, or a clock that
  stepped backwards and was held rather than followed, makes it accurate to
  the millisecond and no further.
- **`mintId(now)` steers ids forward, never back.** Passing a `now` earlier
  than an id already minted in this process holds the last one and keeps
  counting, because a decreasing id would break the cursor. A test that needs
  a fixed instant wants `fixedClock`, not this argument.

The price for an adapter: it cannot reuse an existing numeric primary key. It
stores a `uuid` column, or a 36-character string.

## Pagination

```ts
import { type CursorPage, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, invalidCursor, pageLimit } from '@nxgt/janus';

interface CursorPage<T> {
	readonly items: readonly T[];
	readonly nextCursor: string | null; // null on the last page, never undefined
}

pageLimit(undefined, 'listThings'); // 20 — DEFAULT_PAGE_SIZE
pageLimit(500, 'listThings');       // 100 — MAX_PAGE_SIZE, the cap
pageLimit(0, 'listThings');         // TypeError: listThings: limit must be an integer of at least 1, or absent
```

There is **no `total`**: a count over a cursor-paged collection is a second
query whose answer is stale by the time you read it. `while (cursor)` is the
loop:

```ts
let cursor: string | null = null;
do {
	const page = await auth.list({ after: cursor, limit: 100 });
	cursor = page.nextCursor;
} while (cursor);
```

`invalidCursor(where, cursor)` builds the `INVALID_CURSOR` error an adapter
throws for a cursor it did not mint — never a silent first page, which would
make a caller paging a list loop for ever. The message holds the cursor's
length, not its bytes.

## Durations

```ts
type Duration = number | `${number}${'ms' | 's' | 'm' | 'h' | 'd'}`;
```

```ts
import { parseDuration } from '@nxgt/janus';

parseDuration('15m', 'tokens.resetPassword'); // 900000
parseDuration(1500, 'session.renewAfter');    // 1500 — a number is milliseconds
```

Every duration option of `janus()` takes this. `'2w'` is a compile error; a
value the type cannot see through — from an environment variable, say — is a
`TypeError` at run time, and the second argument names the option in its
message. One gap is known and written down: `'30 m'`
satisfies the type — TypeScript's `${number}` tolerates the space — and
`parseDuration` refuses it at run time.

## Clocks

```ts
import { type Clock, fixedClock, systemClock } from '@nxgt/janus';

interface Clock { now(): Date }

systemClock.now();                                   // the default
const clock = fixedClock(Date.UTC(2026, 0, 1));      // a Date or milliseconds; 0 when absent
clock.advance(60_000);
clock.set(new Date('2026-02-01T00:00:00Z'));
```

`fixedClock` is **shipped, not test-only**: testing session expiry needs it,
and so do your own tests. Pass it as `janus({ clock })` — see
[sessions](sessions.md#testing-expiry).

## See also

- [Permissions](permissions.md) — where subjects and tuples are used
- [Errors](errors.md) — the error classes, also exported from `@nxgt/janus`
