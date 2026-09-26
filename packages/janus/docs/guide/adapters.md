# Writing an adapter — the ports and `@nxgt/janus/conformance`

This page is for putting `janus()` or `permissions()` on a database of your
choice: the two ports you implement, the rules they carry, and the conformance
suites that check an implementation keeps them. If you only use an existing
adapter, such as `@nxgt/janus-mongo`, you do not need it.

```ts
import { describe, it } from 'bun:test';
import { describeJanusStores } from '@nxgt/janus/conformance';

// Yours: myStores(db) builds your adapter's stores, freshDatabase() an empty
// database with a way to make one command fail.
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

## The two ports

| Port | Taken by | Methods |
| --- | --- | --- |
| `JanusStores` — `{ users: UserStore, sessions: SessionStore, tokens: TokenStore }` | `janus({ store })` | 6 + 6 (+ 1 optional) + 4 |
| `RelationStore` | `permissions({ store })`, `janus({ relations })` | 6 |

They are separate on purpose: an application that only authenticates
implements nothing for permissions, and each of the three user slots may come
from a different adapter — users in one database, sessions and tokens in
another:

```ts
janus({
	user: User,
	password: { login: 'email' },
	store: { users: mongo.users, sessions: other.sessions, tokens: other.tokens },
	hasher: scryptHasher(),
});
```

The seam is where atomicity is not required: a user and their password are one
record, a session is derived state, a token is ephemeral.

### `UserStore`

```ts
interface UserStore {
	insertUser(record: UserRecord): Promise<UserRecord>;
	findUser(id: Id): Promise<UserRecord | null>;
	findUserByLogin(type: string, login: string): Promise<UserRecord | null>;
	listUsers(page: UserPageRequest): Promise<CursorPage<UserRecord>>;
	updateUser(id: Id, patch: UserPatch, ifVersion: number): Promise<UserRecord>;
	deleteUser(id: Id): Promise<boolean>;
}
```

- `insertUser` is **idempotent under retry**: a user with this `id` already
  stored is answered as stored. A login held by another user of the same type
  rejects with `StoreConflict('login', …)`, from the database's own unique
  constraint, carrying `login` and `userType` — never the login in its
  message, which the conformance suite checks.
- `updateUser` writes **only if the stored version is exactly `ifVersion`**,
  and never replaces a record whole: a field the patch does not name is left
  as it is. It rejects with `NotFoundError` for an unknown id — the one
  absence on the port that throws, because an update always follows a read —
  and `StoreConflict('version', …)` when the version moved.
- `listUsers` pages in ascending id order; `after` is the last id of the
  previous page, already checked by the core.

#### A user's password and second factor

Both are one field of `UserRecord`, `null` when the user has none, and a
patch treats both alike: **absent keeps it, `null` removes it, a value
replaces it whole**.

```ts
interface UserRecord {
	// …id, type, schemaVersion, active, fields, logins…
	readonly password: { readonly hash: string; readonly updatedAt: Date } | null;
	readonly secondFactor: {
		readonly method: 'totp';
		readonly secret: string; // opaque: store it byte for byte
		readonly confirmedAt: Date | null; // null while enrolment waits for a first code
		readonly lastStep: number | null; // the time step of the last code accepted
	} | null;
	// …emailVerifiedAt, version, createdAt, updatedAt
}
```

`secret` is **opaque to a store**: the core seals it with a key the
application holds — AES-256-GCM, written `v1.<key id>.<iv>.<ciphertext>` —
before a store sees it, so a dump of the users cannot produce a code. Keep it
like a password hash — byte for byte, no parsing, no trimming. The core
rewrites it, sealed under another key, when the application
[rotates its keys](second-factor.md#rotating-the-keys). Store
the second factor whole: a method without a secret, or a `lastStep` without a
method, is a record the core never writes.

```ts
import type { UserPatch } from '@nxgt/janus';

const keep: UserPatch = { updatedAt: new Date() }; // secondFactor untouched
const remove: UserPatch = { updatedAt: new Date(), secondFactor: null };
```

An adapter that stored users before this field existed reads its absence as
`null`, never `undefined` (rule 2): a user with no second factor holds `null`.

### `SessionStore` and `TokenStore`

```ts
interface SessionStore {
	insertSession(record: SessionRecord): Promise<void>;
	findSessionByTokenHash(tokenHash: string): Promise<SessionRecord | null>;
	extendSession(id: SessionId, expiresAt: Date): Promise<SessionRecord | null>; // null once revoked
	revokeSession(id: SessionId, at: Date): Promise<boolean>;
	revokeUserSessions(userId: Id, at: Date, except?: SessionId): Promise<number>;
	deleteUserSessions(userId: Id): Promise<number>;
	deleteExpiredSessions?(before: Date): Promise<number>; // optional: omit it if the database expires on its own
}

interface TokenStore {
	insertToken(record: TokenRecord): Promise<void>;
	consumeToken(tokenHash: string, kind: TokenKind, at: Date): Promise<TokenRecord | null>;
	countAttempt(tokenHash: string, kind: TokenKind): Promise<TokenRecord | null>;
	spendUserTokens(userId: Id, kind: TokenKind, at: Date): Promise<number>; // the unspent ones only
	deleteUserTokens(userId: Id): Promise<number>;
}
```

`consumeToken` is the most important method on the port: it spends the token
and answers it **as it was before the call**, in **one conditional write**.
Twenty concurrent calls must produce exactly one answer with `spentAt: null`;
in MongoDB that is one `findOneAndUpdate` returning the document before the
update. A read followed by a write lets two requests redeem one reset token.

A token is its hash, never its secret, and what it is for:

```ts
type TokenKind = 'verifyEmail' | 'resetPassword' | 'secondFactor' | 'signInCode';

interface TokenRecord {
	readonly tokenHash: string;
	readonly kind: TokenKind;
	readonly userId: Id;
	readonly address: string; // '' for a secondFactor challenge: nothing was sent
	readonly codeHash: string | null; // a signInCode's code, hashed; null for every other kind
	readonly attempts: number; // 0 at insertion
	readonly expiresAt: Date;
	readonly spentAt: Date | null;
	readonly createdAt: Date;
}
```

A token redeemed for another kind is unknown: every method that takes a
`kind` matches on it. A `secondFactor` token is the challenge `signIn`
answers, and its `address` is `''`: a column or a validator that refuses an
empty string refuses every sign-in with a code. `codeHash` and `attempts` round-trip like every other
field. An adapter whose stored tokens predate them reads them as `null` and
`0`, as the three published adapters do, so no data migration is needed for
them.

Expiry is the core's decision: a read answers a stored session verbatim,
lapsed or revoked, and never a record it has changed. A store with its own
expiry — a TTL index, a Redis key TTL — may drop a lapsed session or token
before anyone asks: reads then answer `null`, and `deleteUserSessions` does
not count it. The conformance suite accepts both.

### `TokenStore.countAttempt`

Counts one attempt at a code against a token, and answers the token **as it
is after the call** — what bounds the attempts at a six-digit code:

| The stored token | Written | Answered |
| --- | --- | --- |
| unspent, of this `kind` | `attempts + 1` | the token, with the new count |
| spent, of this `kind` | nothing | the token as it is |
| another `kind`, or no token with this hash | nothing | `null` |

Like `consumeToken`, it is **one conditional write**, never a read followed by
a write: twenty concurrent calls answer the counts 1 to 20, each once. A count
two attempts both read is an attempt for free. Whether the count is past the
limit, and whether the code matches, is the core's decision after the call;
spending the token stays `consumeToken`'s.

A **lapsed** token is counted all the same, or answered `null` by a store that
has already dropped it (a TTL index, a Redis key TTL). Do not compare
`expiresAt` in the store: as for `consumeToken`, the core compares it after
the call.

In MongoDB, one `findOneAndUpdate` answering the document after it, then a
plain read for the spent case:

```ts
import type { TokenStore } from '@nxgt/janus';

// tokens: your collection; toToken: your document → TokenRecord
export const countAttempt: TokenStore['countAttempt'] = async (tokenHash, kind) => {
	const after = await tokens.findOneAndUpdate(
		{ _id: tokenHash, kind, spentAt: null },
		{ $inc: { attempts: 1 } },
		{ returnDocument: 'after' },
	);
	if (after !== null) return toToken(after);
	const spent = await tokens.findOne({ _id: tokenHash, kind }); // written nothing
	return spent === null ? null : toToken(spent);
};
```

In SQL, `update … set attempts = attempts + 1 where token_hash = $1 and kind =
$2 and spent_at is null returning *`, then the same plain read. In Redis, one
Lua script: `HINCRBY` only when `spentAt` is empty, then `HGETALL`. Wrap the
driver's error in `StoreFailure` as in [the six rules](#the-six-rules):
`countAttempt` has its own outage case.

### `TokenStore.spendUserTokens`

Spends every **unspent** token of one user and one `kind` at `at` — but the
one whose hash is `except`, when given — and answers how many it spent. The
core calls it right after issuing a sign-in code, with that code's hash as
`except`, so only the last code sent works; and after writing a password,
for the user's `secondFactor` challenges:

| The stored token | Written | Counted |
| --- | --- | --- |
| unspent, of this user and this `kind` | `spentAt: at` | yes |
| already spent | nothing — `spentAt` never changes once set | no |
| another `kind`, another user, or the one named by `except` | nothing | no |
| none at all | nothing | `0`, an absence — never a failure |

Each token is spent by a **conditional write**, as `consumeToken` spends one:
a token that a racing `consumeToken` spends at the same moment is counted by
exactly one of the two calls, never both. An expired token is spent all the
same, or not counted by a store that already dropped it.

In MongoDB, one `updateMany` through the `userId` index `deleteUserTokens`
already reads:

```ts
import type { TokenStore } from '@nxgt/janus';

export const spendUserTokens: TokenStore['spendUserTokens'] = async (userId, kind, at, except) => {
	const result = await tokens.updateMany(
		{ userId, kind, spentAt: null, ...(except === undefined ? {} : { _id: { $ne: except } }) },
		{ $set: { spentAt: at } },
	);
	return result.modifiedCount;
};
```

In SQL, `update … set spent_at = $3 where user_id = $1 and kind = $2 and
spent_at is null and token_hash <> $4 returning token_hash`, answering the row count: PostgreSQL
re-checks `spent_at is null` on a row a racing redemption just committed. In
Redis, one Lua script over the user's set of tokens, `HSET spentAt` on each
of the right `kind` whose `spentAt` is empty. `spendUserTokens` has its own
outage case.

### `RelationStore`

```ts
interface RelationStore {
	write(changes: { add?: readonly RelationTuple[]; remove?: readonly RelationTuple[] }): Promise<void>;
	has(tuple: RelationTuple): Promise<boolean>;
	findSubjectSets(object: Entity, relation: string): Promise<readonly SubjectSet[]>;
	findEntities(object: Entity, relation: string): Promise<readonly Entity[]>;
	findObjects(page: ObjectPageRequest): Promise<CursorPage<string>>;
	deleteEntity(entity: Entity): Promise<number>;
}
```

One-hop questions about stored tuples, never a permission: the traversal is
the core's. `write` is **all or nothing**, removals first, and idempotent.
`findObjects` is the reverse index `list()` walks, in ascending id order.
`deleteEntity` removes every tuple naming the entity as object, as subject,
and as the entity of a subject set.

## The six rules

Written on the port's types, and checked by the suites:

1. **An absence is `null`. A failure throws.** A method that can find nothing
   answers `null`, `false`, `0` or an empty page; everything else throws,
   preferably `StoreFailure` with the driver's error as `cause`. Never write
   `try { … } catch { return null }` in an implementation.
2. **`null`, not `undefined`.** A function that forgot to `return` produces
   `undefined`; `null` has to be written on purpose.
3. **Uniqueness is a constraint** — a unique index, never a read followed by a
   write.
4. **Bytes round-trip.** No normalising, trimming or retyping. The core
   normalises logins before a store sees them, and never hands a store
   `\u0000` or a lone surrogate; every other character comes back as written.
5. **Every method is atomic on its own.** The core opens no transaction; an
   adapter may open one inside a method.
6. **Schema management is not on the port.** Expose your own `sync`; the core
   never calls it.

```ts
import { type Id, StoreFailure, type UserRecord, type UserStore } from '@nxgt/janus';

export const findUser: UserStore['findUser'] = async (id: Id) => {
	let found: UserRecord | undefined;
	try {
		found = await db.users.findOne({ _id: id });
	} catch (cause) {
		throw new StoreFailure('users.findUser: the store could not answer', {
			slot: 'users',
			operation: 'findUser',
			cause,
		});
	}
	return found ?? null; // an absence, written on purpose
};
```

An adapter **defines no error class**. It throws `@nxgt/janus`'s own
`StoreFailure`, `StoreConflict` and `NotFoundError`, and declares
`@nxgt/janus` as a **peer dependency**, never a dependency, so there is one
copy of each class and `instanceof` holds in the application. A cursor it
cannot read is `invalidCursor(where, cursor)`. Records, patches and page
requests are exported as types: `UserRecord`, `UserPatch`, `UserPageRequest`,
`PasswordRecord`, `SecondFactorRecord`, `SessionRecord`, `TokenRecord`, `TokenKind`, `Json`,
`JsonObject`, and `ObjectPageRequest`, `RelationChanges` from
`@nxgt/janus/permissions`.

`createMemoryStores()` and `createMemoryRelations()` are the reference
implementations: read them when a rule is unclear. `janus()` runs
`assertStores` on what it is given, and a partially implemented store is a
compile error naming the missing method.

## The conformance suites

| Suite | Cases | Harness opens |
| --- | --- | --- |
| `describeJanusStores({ name, harness, runner?, faults?, skip? })` | 49: users, sessions, tokens, and one outage per method whose honest answer can be "nothing" — thirteen of them | `{ stores, faults?, close? }` |
| `describeRelationStores({ name, harness, runner?, faults?, skip? })` | 15: the relation store, and one outage per method | `{ store, faults?, close? }` |

`harness.open()` is called **once per case** and must answer fresh, empty
stores: a case that leaks into the next is the hardest failure to debug.
`close()` runs after the case, pass or fail.

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `name` | string | — | The suite's title |
| `harness` | `ConformanceHarness` / `RelationHarness` | — | Opens fresh stores per case |
| `runner` | `{ describe, it }` | `globalThis` | **Required under `bun test`**: Bun does not put `describe` and `it` on `globalThis`. jest, and vitest with `globals: true`, are found without it |
| `faults` | boolean | — | Declare `false` up front and the report says so in the suite's title |
| `skip` | `{ [caseId]: reason }` | `{}` | Skips a case, reported with the reason — never silent |

The suites import no test framework and no assertion library.

The second factor, attempts and a user's tokens spent have their own cases — skip one by its id
while you work on it, never to ship:

| Case | Checks |
| --- | --- |
| `users.secondFactorSlot` | round-trip; a patch not naming it keeps it; `null` removes it |
| `tokens.countAttempt` | two calls answer `attempts` 1 then 2, `codeHash` as written; `consumeToken` answers the count |
| `tokens.countAttemptConcurrency` | twenty concurrent calls answer 1 to 20, each once |
| `tokens.countAttemptRace` | attempts racing one redemption: the counts answered unspent are 1 to the final count, and every answer after the spend carries that final count |
| `tokens.challenge` | a second-factor challenge, whose `address` is `''`, kept, counted and spent like any token |
| `tokens.countAttemptSpent` | a spent token answered unchanged; another kind and an unknown hash answer `null` and count nothing |
| `outage.countAttempt` | a store that cannot answer rejects, never `null` |
| `tokens.spendUserTokens` | spends the unspent tokens of one user and kind at `at`, keeping their attempts, and counts them; a spent token keeps its `spentAt`; another kind and another user are untouched; `0` for none |
| `tokens.spendUserTokensExcept` | spares the token named by `except`, and spends the user's others of that kind |
| `tokens.spendUserTokensRace` | racing one `consumeToken`, ten times over: exactly one of the two spends the token |
| `outage.spendUserTokens` | a store that cannot answer rejects, never `0` |

### `faults`: prove the outage invariant

`faults` is optional, and **its absence is reported, never passed over**:
without it the outage cases are skipped with the reason *"faults not provided:
the outage invariant is not proven for this adapter"*.

```ts
import type { StoreFaults } from '@nxgt/janus/conformance';

const faults: StoreFaults = {
	async fail(slot, method) {
		await database.failNext(method); // make the DATABASE fail this call
	},
};
```

Make the database fail the way it really fails — for MongoDB, the
`failCommand` fail point with code 91 (`ShutdownInProgress`). A wrapper that
throws in front of your adapter proves the wrapper, not the adapter's
translation of a driver error. Fail **only the method named**: the write
outage cases read the store back afterwards, to prove a rejected write changed
nothing.

The relation suite's `faults` is `{ fail(method) }`, with no slot:

```ts
import { describeRelationStores } from '@nxgt/janus/conformance';

describeRelationStores({
	name: 'my adapter',
	runner: { describe, it },
	harness: {
		async open() {
			const database = await freshDatabase();
			return {
				store: myRelations(database),
				faults: { fail: (method) => database.failNext(method) },
				close: () => database.drop(),
			};
		},
	},
});
```

### Skipping a case, and declaring no faults

```ts
describeJanusStores({
	name: 'my adapter',
	runner: { describe, it },
	faults: false,
	skip: { 'users.omission': 'not yet: tracked in the issue tracker' },
	harness: {
		async open() {
			const database = await freshDatabase();
			return { stores: myStores(database), close: () => database.drop() };
		},
	},
});
```

A skipped case still appears in the run, with its reason in its name. A case
that cannot run on the stores it was given — an outage case with no `faults`,
`collectExpired` on a store without `deleteExpiredSessions` — passes, and
emits a `JANUS_CONFORMANCE_SKIPPED` warning with the reason.

### Without a test runner

The cases are data, and `runCase` runs one against a harness:

```ts
import { allCases, referenceHarness, runCase } from '@nxgt/janus/conformance';

for (const conformanceCase of allCases) {
	const outcome = await runCase(conformanceCase, referenceHarness());
	console.log(conformanceCase.id, 'skipped' in outcome ? `skipped: ${outcome.skipped}` : 'passed');
}
```

| Export | What it is |
| --- | --- |
| `allCases`, `userStoreCases`, `sessionStoreCases`, `tokenStoreCases`, `outageCases` | The identity stores' cases, as `ConformanceCase` objects with a stable `id` |
| `runCase(case, harness)` | Runs one; throws on failure, answers `{ passed: true }` or `{ skipped }` |
| `SKIP_REASONS` | The reasons the suite gives itself |
| `allRelationCases`, `relationStoreCases`, `relationOutageCases`, `runRelationCase` | The same for the relation store |
| `referenceHarness()`, `referenceRelationHarness()` | The suites against the reference stores: the examples to copy |

Types: `ConformanceHarness`, `OpenedStores`, `StoreFaults`, `ConformanceCase`,
`CaseContext`, `ConformanceRunner`, `PortMethod`, and `RelationHarness`,
`OpenedRelations`, `RelationFaults`, `RelationCase`, `RelationContext`,
`RelationMethod`.

## See also

- [Errors](errors.md) — `StoreFailure`, `StoreConflict` and the rule behind them
- [Vocabulary](vocabulary.md) — ids, cursors and `invalidCursor`
- `@nxgt/janus-mongo` — an adapter that passes both suites against a real mongod, outages included
- `@nxgt/janus-drizzle` — both suites on PostgreSQL 17 and PGlite
- `@nxgt/janus-redis` — the sessions and one-time tokens cases on Redis 7.4
