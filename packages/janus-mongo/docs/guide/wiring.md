# Wiring the stores and the relations

This page is for connecting `@nxgt/janus` to MongoDB: the three user stores
for `janus()`, the relation store for `permissions()`, and what each gives
back when the database cannot answer. Creating the collections and indexes is
on [the sync page](sync.md).

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { createMongoAdapter } from '@nxgt/janus-mongo';
import { MongoClient } from 'mongodb';
import { z } from 'zod';

const client = new MongoClient(process.env.MONGO_URL ?? 'mongodb://localhost:27017');
const db = client.db('janus');

const mongo = createMongoAdapter(db); // { store, relations }

export const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	hasher: scryptHasher(),
	...mongo, // deleting a user deletes every tuple naming them
});

export const model = defineModel({
	subjects: auth.types,
	types: {
		document: {
			relations: { owner: ['user'], viewer: ['user'] },
			permissions: { view: ['owner', 'viewer'] },
		},
	},
});

export const access = permissions({ model, store: mongo.relations });
```

## `createMongoAdapter(db)`

```ts
function createMongoAdapter(db: Db): MongoAdapter; // { store, relations }
```

`createMongoStores(db)` as `store` and `createMongoRelations(db)` as
`relations`: the two keys `janus()` takes them under, so a spread wires both,
and `permissions()` takes the same relation store as `mongo.relations`. It
connects to nothing.

**Pass the relation store to both.** Given to `permissions()` alone, tuples
are written, and deleting a user leaves every one naming them behind — the
spread is what makes that impossible to forget. An application that only
authenticates takes `createMongoStores(db)` alone, below.

## `createMongoStores(db)`

```ts
function createMongoStores(db: Db): JanusStores; // { users, sessions, tokens }
```

What `janus({ store })` takes. **It connects to nothing** and sends nothing:
the first command goes out on the first call that needs one. `db` is a
`mongodb` `Db`; the adapter reads the `users`, `sessions` and `tokens`
collections of it.

Every method of the port is implemented except the optional
`deleteExpiredSessions`: a TTL index drops lapsed sessions, so
`auth.collectExpired()` answers `UNSUPPORTED` with this adapter. Do not
schedule it.

## `createMongoRelations(db)`

```ts
function createMongoRelations(db: Db): RelationStore;
```

What `permissions({ store })` takes, and `janus({ relations })`. It connects to
nothing either, and reads the `relations` collection.

**A write of more than one tuple is a transaction**, and MongoDB runs
transactions on a replica set only. `grant` and `revoke` write one tuple and
run anywhere, including a standalone `mongod`; a multi-tuple `write` there
fails with `STORE_FAILED`. The transaction is not retried: a write is
idempotent, so retry it yourself if you want to.

`findObjects` orders ids as MongoDB does, by UTF-8 bytes. `list()` sorts what
it gathers, so its pages do not depend on that; a caller of the store directly
sees byte order, which differs from JavaScript's `<` only past U+FFFF.

## What a failure looks like

The adapter defines **no error class**. Every rejection is `@nxgt/janus`'s
own, so `instanceof` holds in your code — `@nxgt/janus` is a peer, and there
is one copy of it:

| What the driver reports | What you get |
| --- | --- |
| A duplicate key on the login index | `StoreConflict` — `LOGIN_TAKEN`, carrying `login` and `userType` |
| A duplicate key on `_id` | nothing: the insert was a retry, and answers what is stored |
| A duplicate key on **any other index** | `StoreFailure` — an adapter bug, never reported as a taken login |
| A validator refusing a document (121) | `StoreFailure` — the core validated it already, so it is never the caller's fault |
| Anything else: a timeout, a stepped-down primary, a refused connection | `StoreFailure`, with the driver's error as `cause` |

Nothing answers `null` for an error. So a route answers 503, not 401 or 404:

```ts
import { StoreFailure } from '@nxgt/janus';

export async function me(request: Request): Promise<Response> {
	try {
		const current = await auth.authenticate(request);
		return current === null ? new Response(null, { status: 401 }) : Response.json({ id: current.user.id });
	} catch (error) {
		if (error instanceof StoreFailure) return new Response(null, { status: 503 });
		throw error;
	}
}
```

The error's message names the slot and the method (`users.findUser: the store
could not answer`) and never the connection string.

## Mixing adapters

Each slot of `JanusStores` may come from a different store. Users in MongoDB,
sessions and tokens elsewhere:

```ts
import { createMemoryStores, janus, scryptHasher } from '@nxgt/janus';
import { createMongoStores } from '@nxgt/janus-mongo';
import { z } from 'zod';

const mongo = createMongoStores(db);
const other = createMemoryStores(); // or another adapter's stores

export const auth = janus({
	user: z.object({ email: z.email() }),
	password: { login: 'email' },
	store: { users: mongo.users, sessions: other.sessions, tokens: other.tokens },
	hasher: scryptHasher(),
});
```

## Testing against a real `mongod`

The reference store `createMemoryStores()` is faster, but it is not MongoDB.
When a test depends on a transaction or on the unique index, run a
single-node replica set — the adapter's own specs use
`mongodb-memory-server-core`, one database per case:

```ts
import { createMongoAdapter, syncMongoAdapter } from '@nxgt/janus-mongo';
import { MongoClient } from 'mongodb';
import { MongoMemoryReplSet } from 'mongodb-memory-server-core';

const server = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
const client = await MongoClient.connect(server.getUri());

const db = client.db('janusTest');
await syncMongoAdapter(db);
const mongo = createMongoAdapter(db);

// after the suite
await client.close();
await server.stop();
```

## See also

- [Collections and indexes](sync.md) — `syncMongoAdapter`, `syncMongoStores`, `syncMongoRelations`, and what the database holds
- [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) — its `docs/guide/` covers users, sessions and permissions
