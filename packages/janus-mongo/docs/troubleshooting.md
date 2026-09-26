# Troubleshooting `@nxgt/janus-mongo`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

This adapter **defines no error class**. Every error it throws is one of
`@nxgt/janus`'s — `StoreFailure`, `StoreConflict`, `NotFoundError` — so the
codes, and what each one deserves as an answer, are those of the core. The
errors the core raises itself (`CREDENTIALS_INVALID`, `TOKEN_EXPIRED`,
`PERMISSION_DEPTH`, …) are in
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md).

How the driver's errors become the port's:

| What MongoDB answers | What you get |
| --- | --- |
| A duplicate key on the login index | `LOGIN_TAKEN`, carrying `login` and `userType` |
| A duplicate key on `_id` | Nothing: the insert was a retry, and what is stored is answered |
| A duplicate key on any other index | `STORE_FAILED` |
| A `$jsonSchema` validation failure (code 121) | `STORE_FAILED` |
| Anything else | `STORE_FAILED`, with the driver's error as `cause` |

## Index

**Install and types**
- [`TS2834: Relative import paths need explicit file extensions …`](#ts2834-relative-import-paths-need-explicit-file-extensions-in-ecmascript-imports-when---moduleresolution-is-node16-or-nodenext)
- [`error instanceof StoreFailure` is `false` for an outage](#error-instanceof-storefailure-is-false-for-an-outage)

**Setup**
- [Two sign-ups with the same login both succeed](#two-sign-ups-with-the-same-login-both-succeed)
- [`STORE_FAILED` — `relations.write: the store could not answer` on a standalone mongod](#store_failed--relationswrite-the-store-could-not-answer-on-a-standalone-mongod)
- [`STORE_FAILED` with `Document failed validation` as its cause](#store_failed-with-document-failed-validation-as-its-cause)

**Runtime**
- [`STORE_FAILED` — `<slot>.<operation>: the store could not answer`](#store_failed--slotoperation-the-store-could-not-answer)
- [`LOGIN_TAKEN` — `<operation>: the login is taken by another <type>`](#login_taken--operation-the-login-is-taken-by-another-type)
- [`STORE_FAILED` — `<slot>.<operation>: a duplicate key on <fields>, which this adapter never writes on purpose`](#store_failed--slotoperation-a-duplicate-key-on-fields-which-this-adapter-never-writes-on-purpose)
- [`NOT_FOUND` / `VERSION_CONFLICT` — `updateUser: …`](#not_found--version_conflict--updateuser-)
- [`UNSUPPORTED` — `collectExpired: store.sessions does not implement deleteExpiredSessions …`](#unsupported--collectexpired-storesessions-does-not-implement-deleteexpiredsessions--)
- [Lapsed sessions and tokens are still in the collection](#lapsed-sessions-and-tokens-are-still-in-the-collection)
- [`findObjects` answers ids in a different order than JavaScript sorts them](#findobjects-answers-ids-in-a-different-order-than-javascript-sorts-them)

---

## Install and types

### `TS2834: Relative import paths need explicit file extensions in ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'.`

With `skipLibCheck: true`, the same cause shows up instead as
`TS2305: Module '"@nxgt/janus-mongo"' has no exported member '<name>'.`

**When:** `tsc` on your project, reported inside the package's `dist/*.d.ts`.
**Why:** the declarations of this package and of `@nxgt/janus` import their siblings without an extension, the way a bundler resolves them. `moduleResolution: "nodenext"` (or `"node16"`) is **not supported**.
**Fix:**

```jsonc
// tsconfig.json
{
  "compilerOptions": {
    "module": "preserve",          // or "esnext"
    "moduleResolution": "bundler"
  }
}
```

Do not patch the declarations to add `.js` extensions: that support is out of
scope, and a patched copy breaks on the next install.

### `error instanceof StoreFailure` is `false` for an outage

**When:** at run time, testing an error from this adapter against the class you imported from `@nxgt/janus`.
**Why:** two copies of `@nxgt/janus` are installed. This adapter throws the `StoreFailure` of the copy *it* resolves; if that is not yours, `instanceof` fails, and an outage — or a taken login — is handled as an unknown error.
**Fix:** `@nxgt/janus` is a **required peer** of this package: install it once, in your application, at a version the peer range accepts.

```sh
bun add @nxgt/janus-mongo @nxgt/janus @nxgt/mongo mongodb zod
bun pm ls --all | grep @nxgt/janus   # one @nxgt/janus, not two
```

---

## Setup

### Two sign-ups with the same login both succeed

**When:** concurrent `signUp` or `create` calls with one login — or any second sign-up — after deploying to a new database.
**Why:** `syncMongoStores(db)` was never run, so the `loginUnique` index does not exist. The core never reads first to decide uniqueness; only the index refuses a duplicate, and it is what produces `LOGIN_TAKEN`. The core never manages a schema, so nothing creates the index for you.
**Fix:** run the sync as a deployment step, with a user that has the `dbAdmin` role — never per request:

```ts
import { syncMongoAdapter } from '@nxgt/janus-mongo';

await syncMongoAdapter(db); // users, sessions, tokens and relations: validators and indexes
// identities alone: syncMongoStores(db)
```

An application that deploys with `@nxgt/mongo`'s `syncAll(db)` already syncs
the three stores' collections, since defining them registers them.

### `STORE_FAILED` — `relations.write: the store could not answer` on a standalone mongod

`error.cause` is the driver's
`This MongoDB deployment does not support retryable writes. Please add retryWrites=false to your connection string.`

**When:** a relation-store `write` of more than one tuple — `store.write({ add: [a, b] })`, or an add and a remove together — against a standalone `mongod`. `grant` and `revoke` write one tuple and are not affected.
**Why:** a write of several tuples runs in a transaction, and MongoDB runs transactions on a replica set only. Adding `retryWrites=false`, as the driver suggests, does not help: the transaction is still refused.
**Fix:** run a replica set. For local development and tests, a single-node replica set is enough:

```sh
mongod --replSet rs0 --dbpath ./data
mongosh --eval 'rs.initiate()'
```

```ts
// In tests, with mongodb-memory-server
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';
const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
```

The transaction is not retried by the adapter — the driver's `withTransaction`
would retry an outage for two minutes before answering. A relation write is
idempotent, so retry it yourself.

### `STORE_FAILED` with `Document failed validation` as its cause

**When:** a write — `insertUser`, `updateUser`, `insertSession`, … — rejected by the collection's `$jsonSchema` validator (MongoDB error code 121).
**Why:** the core validates every record before it reaches the store, so a validator refusing one means the collection and the adapter disagree: the collection's validator was set by another version of this adapter, or a collection of the same name (`users`, `sessions`, `tokens`, `relations`) already belonged to your application, with its own validator. It is never the caller's fault, and never a 400.
**Fix:** after upgrading this package, run `syncMongoStores(db)` again — upgrading to 0.3 is exactly this case: the validator the previous sync wrote refuses `secondFactor`, `codeHash` and `attempts` until it runs. See [sync before you deploy](guide/sync.md#upgrading-sync-before-you-deploy). If your application already has a `users` collection, the adapter is sharing its database: give it one of its own, `janus`:

```ts
const auth = janus({ ..., store: createMongoStores(client.db('janus')) });
```

---

## Runtime

### `STORE_FAILED` — `<slot>.<operation>: the store could not answer`

`StoreFailure`, for example `users.findUserByLogin: the store could not answer`, with `slot`, `operation` and the driver's error as `cause`.

**When:** any call that reaches MongoDB while it cannot answer: the server is unreachable, server selection timed out, MongoDB refused the connection's user and password, a primary stepped down.
**Why:** a store that cannot answer throws — it never answers `null`. The driver's message stays out of the error's message, because it can hold the connection string, and a connection string holds a password.
**Fix:** answer **503** and log `cause`; never map it to 401, 404, `null` or `false`.

```ts
import { JanusError } from '@nxgt/janus';

if (error instanceof JanusError && error.code === 'STORE_FAILED') {
  logger.error({ slot: error.slot, operation: error.operation, cause: error.cause });
  return new Response('Try again shortly', { status: 503 });
}
```

### `LOGIN_TAKEN` — `<operation>: the login is taken by another <type>`

`StoreConflict` with `on: 'login'`, for example `insertUser: the login is taken by another patient`. It carries `login` and `userType`. The login is not in the message, which never carries a value: an e-mail in a log line is personal data. Read it from `error.login`.

**When:** `signUp`, `create`, or an `update` that changes the login, when another user **of the same type** already holds it. The message names the port method (`insertUser`, `updateUser`), not your call.
**Why:** the `loginUnique` index on `{ type, logins }` refused the write. The same e-mail may hold one user per user type.
**Fix:** answer 409.

### `STORE_FAILED` — `<slot>.<operation>: a duplicate key on <fields>, which this adapter never writes on purpose`

**When:** a write refused by a unique index that is not the login index — typically one you added to `users` or `sessions` yourself.
**Why:** this adapter only ever collides on the login index and on `_id`. A duplicate anywhere else is reported as a failure, not as `LOGIN_TAKEN`: that would tell somebody their e-mail is in use when it is not.
**Fix:** drop the extra unique index (`db.users.getIndexes()` lists them), or make it non-unique. Uniqueness of your own fields belongs in your own collection.

### `NOT_FOUND` / `VERSION_CONFLICT` — `updateUser: …`

`updateUser: no user has this id`, and `updateUser: expected version <n>, found <m>`.

**When:** calling `createMongoStores(db).users.updateUser(...)` directly. Through `janus()`, the same refusals carry the name of your call instead (`update: …`).
**Why:** the write matched nothing, and the adapter reads again to tell an unknown id from a version that moved. On a conflict nothing was written.
**Fix:** for a conflict, read the user again and retry; see `VERSION_CONFLICT` in the core's troubleshooting.

### `UNSUPPORTED` — `collectExpired: store.sessions does not implement deleteExpiredSessions — …`

**When:** `auth.collectExpired()`.
**Why:** deliberate. The `expiry` TTL index already deletes lapsed sessions, so this adapter does not implement `deleteExpiredSessions`.
**Fix:** do not schedule `collectExpired` with this adapter. Nothing is lost: expiry never depended on it.

### Lapsed sessions and tokens are still in the collection

**When:** looking at `sessions` or `tokens` in a shell shortly after `expiresAt`.
**Why:** MongoDB's TTL monitor runs every sixty seconds, so a document can outlive its `expiresAt` by up to a minute, or more on a loaded server. The TTL index is storage hygiene, not the expiry mechanism.
**Fix:** none needed. The core compares `expiresAt` on every read, so `authenticate` answers a lapsed session as anonymous and refuses a lapsed token (`TOKEN_EXPIRED`, or `TOKEN_UNKNOWN` once the document is gone).

### `findObjects` answers ids in a different order than JavaScript sorts them

**When:** calling the relation store's `findObjects` directly, with ids holding characters past U+FFFF (emoji, some CJK).
**Why:** MongoDB orders strings by UTF-8 bytes; JavaScript's `<` compares UTF-16 code units. The two agree everywhere else.
**Fix:** none through `access.list()`: it sorts what it gathers itself, so its pages do not depend on the store's order. A direct caller that needs JavaScript's order sorts the page.
