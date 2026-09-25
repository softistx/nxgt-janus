# @nxgt/janus-mongo

The MongoDB adapter for [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus): its identity stores —
users, sessions and one-time tokens — and the relation store of
`@nxgt/janus/permissions`, over one database, on
[`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo).

It passes both `@nxgt/janus/conformance` suites against a real mongod, outages
included. `createMongoAdapter(db)` gives both sides under the names `janus()`
takes them, so one spread wires them; each is also usable alone, as in
`@nxgt/janus`: `createMongoStores` for identities, `createMongoRelations` for
permissions.

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { permissions } from '@nxgt/janus/permissions';
import { createMongoAdapter, syncMongoAdapter } from '@nxgt/janus-mongo';

await syncMongoAdapter(db); // a deployment step: creates the collections and indexes

const mongo = createMongoAdapter(db); // { store, relations }

export const auth = janus({
  user: User,
  password: { login: 'email' },
  hasher: scryptHasher(),
  ...mongo, // deleting a user deletes their tuples too
});

export const access = permissions({ model, store: mongo.relations });
```

## Install

```sh
bun add @nxgt/janus-mongo @nxgt/janus @nxgt/mongo mongodb zod
```

Every peer is required: `@nxgt/janus`, `@nxgt/mongo` (`>=0.17 <1`), `mongodb`
(7), `zod` (4.6.5 or later, which `@nxgt/mongo` defines collections with) and `typescript`
(6). `@nxgt/janus` is a **peer**, never a dependency: this package defines no
error class and throws the peer's own, so `instanceof StoreFailure` holds in
your code. Like it, this package expects `"moduleResolution": "bundler"`: the
declarations import without extensions, so `nodenext` is not supported.

## API

| Export | What it is |
| --- | --- |
| `createMongoAdapter(db)` | `{ store, relations }`: both of the below, keyed as `janus()` takes them, so `janus({ …, ...mongo })` wires both. Connects to nothing. |
| `syncMongoAdapter(db, options?)` | `syncMongoStores` and `syncMongoRelations` in one step: the four collections. |
| `MongoAdapter` | The type of what `createMongoAdapter` answers. |
| `createMongoStores(db)` | The `{ users, sessions, tokens }` that `janus()` takes as `store`. Connects to nothing. |
| `syncMongoStores(db, options?)` | Creates the three collections, their validators and indexes, and answers what it changed. Needs `dbAdmin`; run it when you deploy, never per request. |
| `users`, `sessions`, `tokens` | The `@nxgt/mongo` definitions. Defining them registers them, so `syncAll(db)` syncs them with your own collections. |
| `janusCollections` | The three definitions, in sync order. |
| `createMongoRelations(db)` | The `RelationStore` that `permissions()` takes as `store`, and `janus()` as `relations`. Connects to nothing. |
| `syncMongoRelations(db, options?)` | Creates the `relations` collection and its indexes. A separate step: an application that uses identities alone keeps no tuples. |
| `relations` | Its `@nxgt/mongo` definition. |

## What the database holds

The port's records, with the id under `_id` and nothing else renamed or
encoded. A document read in a shell reads like the record in the code.

| Collection | Indexes |
| --- | --- |
| `users` | `loginUnique` on `{ type, logins }`, unique — a login is unique **per user type** · `typeId` on `{ type, _id }` for listing |
| `sessions` | `tokenHashUnique` · `userId` · `expiry`, a TTL index |
| `tokens` | `_id` is the token's hash · `userId` · `expiry`, a TTL index |
| `relations` | `_id` **is the tuple**, `{ object: { type, id }, relation, subject: { type, id, relation? } }` — unique by construction · `objectRelation` for one hop forwards · `subjectObjects` for `findObjects`, which it serves with no in-memory sort (measured: 11 keys examined for a page of 10) |

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
- **No sync function is called for you** — `syncMongoAdapter`, or
  `syncMongoStores` for identities alone. The core never manages a schema.
  Without it there is no unique index, and nothing stops two concurrent sign-ups
  with one login.
- **A duplicate key on an index other than the login index is a
  `StoreFailure`, not `LOGIN_TAKEN`.** Such a duplicate is an adapter bug, and
  reporting it as a taken login would tell somebody their e-mail is in use when
  it is not.
- **A relation write of more than one tuple is a transaction**, and MongoDB runs
  transactions on a replica set only. `grant` and `revoke` write one tuple and
  run anywhere; on a standalone mongod a multi-tuple write fails with
  `STORE_FAILED`. The transaction is not retried: the driver's `withTransaction`
  would retry an outage for two minutes before answering, and a write is
  idempotent, so retry it yourself.
- **`findObjects` orders ids as MongoDB does, by UTF-8 bytes.** `list()` sorts
  what it gathers itself, so its pages do not depend on it; a caller of the
  store directly sees bytes order, which differs from JavaScript's `<` only past
  U+FFFF.

## Documentation

- [Guides](docs/README.md) — wiring the stores, syncing the collections
- [Troubleshooting](docs/troubleshooting.md) — by the error message you see
- [Roadmap](docs/roadmap.md) — what is next, and what is not planned
