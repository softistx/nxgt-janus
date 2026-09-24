# Collections and indexes

This page is for creating what the adapter needs in the database — the
collections, their validators and their indexes — as a deployment step, and
for knowing what ends up stored. Wiring the stores into `janus()` and
`permissions()` is on [the wiring page](wiring.md).

```ts
import { syncMongoRelations, syncMongoStores } from '@nxgt/janus-mongo';
import { MongoClient } from 'mongodb';

const client = await MongoClient.connect(process.env.MONGO_URL ?? 'mongodb://localhost:27017');
const db = client.db('app');

await syncMongoStores(db);    // users, sessions, tokens
await syncMongoRelations(db); // relations — only if you use @nxgt/janus/permissions

await client.close();
```

**The core never manages a schema, and neither function is called for you.**
Without `syncMongoStores` there is no unique index on logins, and nothing stops
two concurrent sign-ups with one e-mail.

## `syncMongoStores` and `syncMongoRelations`

```ts
function syncMongoStores(db: Db, options?: SyncOptions): Promise<SyncReport[]>;
function syncMongoRelations(db: Db, options?: SyncOptions): Promise<SyncReport[]>;
```

Each creates its collections when they are missing, writes their `$jsonSchema`
validators, and creates or rebuilds their indexes, then answers one report per
collection saying what it changed. **Run it twice and the second run sends
nothing.**

- It is a **deployment step**, never a request-time one: `collMod` needs the
  `dbAdmin` role, and neither it nor an index build may run in a transaction.
- The relation store is a separate step because an application that only
  authenticates keeps no tuples.

```ts
for (const report of await syncMongoStores(db)) {
	console.log(report.name, report.created, report.indexes);
}
```

| Option | Type | Default | Effect |
| --- | --- | --- | --- |
| `dryRun` | boolean | `false` | Compare and report, send nothing — a CI check, or a look before a deploy |
| `dropUnknownIndexes` | boolean | `false` | Drop indexes the server has and no definition names. Off: an index someone added on purpose is not this package's to remove |
| `session` | `ClientSession` | none | A session for the reads — not one inside a transaction |

`SyncOptions` and `SyncReport` are `@nxgt/mongo`'s types, which is where the
sync comes from.

```ts
const reports = await syncMongoStores(db, { dryRun: true });
const pending = reports.filter(
	(report) => report.created || report.indexes.created.length + report.indexes.recreated.length > 0,
);
if (pending.length > 0) process.exitCode = 1; // the database is behind the code
```

## With `@nxgt/mongo`'s `syncAll`

The definitions are exported — `users`, `sessions`, `tokens`, `relations`, and
`janusCollections` (the first three, in sync order) — and defining them
registered them with `@nxgt/mongo`. An application that already deploys with
`syncAll(db)` gets them synced with its own collections:

```ts
import '@nxgt/janus-mongo'; // importing it registers the four definitions
import { syncAll, syncCollections } from '@nxgt/mongo';
import { janusCollections, relations } from '@nxgt/janus-mongo';

await syncAll(db); // every registered collection: yours, and the four of this package

// or name them yourself
await syncCollections(db, [...janusCollections, relations]);
```

Importing the package registers `relations` too, so `syncAll` creates it even
for an application that does not use permissions. It stays empty.

## What the database holds

The port's records, with the id under `_id` and nothing else renamed or
encoded: a document read in a shell reads like the record in the code.

| Collection | Holds | Indexes |
| --- | --- | --- |
| `users` | one user: `type`, `fields`, `logins`, `password`, `emailVerifiedAt`, `version`, … | `loginUnique` on `{ type, logins }`, unique — a login is unique **per user type** · `typeId` on `{ type, _id }`, for listing |
| `sessions` | one session, by the `sha256` of its token | `tokenHashUnique` · `userId` · `expiry`, a TTL index |
| `tokens` | one one-time token; `_id` **is** its `sha256` | `userId` · `expiry`, a TTL index |
| `relations` | one tuple; `_id` **is** the tuple, `{ object: { type, id }, relation, subject: { type, id, relation? } }` | `objectRelation`, one hop forwards · `subjectObjects`, the reverse index `list()` walks |

- **No secret is stored.** Sessions and tokens hold the `sha256` of the
  secret; passwords a self-describing hash (`$scrypt$…`, `$argon2id$…`).
- **Ids are strings**, the UUIDv7s the core minted — never an `ObjectId`: the
  store mints nothing.
- **A tuple is unique by construction**, since it is its own `_id`, so writing
  a stored tuple again is a no-op rather than a duplicate. A subject set and
  its entity (`team:t1#member`, `team:t1`) are two different keys.
- `findObjects` is served by `subjectObjects` with no in-memory sort —
  measured, 11 keys examined for a page of 10.
- The collection names are fixed: `users`, `sessions`, `tokens`, `relations`.
  Give the adapter a database of its own when your application already has a
  collection of one of those names.

## The TTL indexes are not the expiry

MongoDB's TTL monitor runs every sixty seconds, so a lapsed session can stay
readable for up to a minute. The core compares `expiresAt` on every read, and
that is what expires it; the TTL index only keeps storage tidy. It is also why
`deleteExpiredSessions` is not implemented, and `auth.collectExpired()` answers
`UNSUPPORTED` with this adapter.

## See also

- [Wiring the stores](wiring.md) — `createMongoStores`, `createMongoRelations`, and what a failure looks like
- [`@nxgt/mongo`](https://www.npmjs.com/package/@nxgt/mongo) — `syncAll`, `syncCollections`, `SyncReport`
