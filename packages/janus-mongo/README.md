# @nxgt/janus-mongo

The MongoDB adapter for [`@nxgt/janus`](../janus/README.md): its three stores —
users, sessions and one-time tokens — over one database, on
[`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo).

It passes the whole `@nxgt/janus/conformance` suite against a real mongod,
outages included.

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { createMongoStores, syncMongoStores } from '@nxgt/janus-mongo';

await syncMongoStores(db); // a deployment step: creates the collections and indexes

export const auth = janus({
  user: User,
  password: { login: 'email' },
  store: createMongoStores(db),
  hasher: scryptHasher(),
});
```

## Install

```sh
bun add @nxgt/janus-mongo @nxgt/janus @nxgt/mongo mongodb zod
```

`@nxgt/janus` is a **required peer**, never a dependency: this package defines
no error class and throws the peer's own, so `instanceof StoreFailure` holds in
your code.

## API

| Export | What it is |
| --- | --- |
| `createMongoStores(db)` | The `{ users, sessions, tokens }` that `janus()` takes as `store`. Connects to nothing. |
| `syncMongoStores(db, options?)` | Creates the three collections, their validators and indexes, and answers what it changed. Needs `dbAdmin`; run it when you deploy, never per request. |
| `users`, `sessions`, `tokens` | The `@nxgt/mongo` definitions. Defining them registers them, so `syncAll(db)` syncs them with your own collections. |
| `janusCollections` | The three definitions, in sync order. |

## What the database holds

The port's records, with the id under `_id` and nothing else renamed or
encoded. A document read in a shell reads like the record in the code.

| Collection | Indexes |
| --- | --- |
| `users` | `loginUnique` on `{ type, logins }`, unique — a login is unique **per user type** · `typeId` on `{ type, _id }` for listing |
| `sessions` | `tokenHashUnique` · `userId` · `expiry`, a TTL index |
| `tokens` | `_id` is the token's hash · `expiry`, a TTL index |

No secret is stored: sessions and tokens hold `sha256` of the secret, and
passwords a self-describing hash.

## Traps

- **The TTL indexes are storage hygiene, not the expiry.** MongoDB's TTL monitor
  runs every sixty seconds, so a lapsed session can stay readable for up to a
  minute. The core compares `expiresAt` on every read, and that is what expires
  it.
- **`auth.collectExpired()` answers `UNSUPPORTED`** with this adapter. The TTL
  index already drops lapsed sessions, so `deleteExpiredSessions` is
  deliberately not implemented.
- **`syncMongoStores` is not called for you.** The core never manages a schema.
  Without it there is no unique index, and nothing stops two concurrent sign-ups
  with one login.
- **A duplicate key on an index other than the login index is a
  `StoreFailure`, not `LOGIN_TAKEN`.** Such a duplicate is an adapter bug, and
  reporting it as a taken login would tell somebody their e-mail is in use when
  it is not.
