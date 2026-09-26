# The configuration

This page covers every key of `defineConfig`:
- `postgres` on `@nxgt/janus-kit/drizzle`, or `mongo` on
  `@nxgt/janus-kit/mongo`: where users, logins and relations are kept;
- `redis`, where sessions and one-time tokens are kept instead;
- `auth` and `access`, the two functions that build the instances;
- `telemetry`.

`defineConfig` checks the configuration and answers it, frozen. It connects to
nothing and reads no environment variable, so read them where your other
settings are read, and pass the values:

```ts
// src/janus.ts
import { janus, scryptHasher } from '@nxgt/janus';
import { connectKit, defineConfig } from '@nxgt/janus-kit/drizzle';
import { User } from './users';

export const config = defineConfig({
	postgres: { url: process.env.JANUS_DATABASE_URL! },
	auth: (adapters) =>
		janus({ user: User, password: { login: 'email' }, hasher: scryptHasher(), ...adapters }),
});

export const kit = await connectKit(config);
```

What is wrong with it throws a `TypeError` there, where the application
starts. `connectKit` runs the same checks again, as `connectKit: …`, for a
configuration built without `defineConfig`: a missing URL must not reach Bun's
`SQL`, which would read `DATABASE_URL` instead. An unreachable database, or
one without the tables, is `connectKit`'s `Error`: `defineConfig` has not
connected yet.

## `postgres`

Required. Users, logins, relations, and sessions and tokens unless `redis`
holds them.

```ts
postgres: { url: process.env.JANUS_DATABASE_URL! }   // opened and closed by the kit
postgres: { db }                                      // a Drizzle instance you opened, never closed by the kit
```

With `url`, the kit opens it over Bun's `SQL`, as `drizzle-orm/bun-sql`. It
must be a `postgres://` or `postgresql://` URL: Bun's `SQL` would open
`mysql://` or `sqlite://` as another database, so `defineConfig` refuses
them, naming the scheme and never the URL. The
recommended URL is **a database of Janus's own**, which is backed up and
restored alone: [`@nxgt/janus-drizzle`'s guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/database.md)
shows how to create it, and its tables.

With `db`, any Drizzle PostgreSQL instance works: node-postgres, postgres.js,
Bun's `SQL`, PGlite in tests.

**`tables`** is what your schema file's `defineJanusTables(…)` returned. Pass it
when the tables are in a PostgreSQL schema of their own:

```ts
// src/db/schema.ts
import { defineJanusTables } from '@nxgt/janus-drizzle';
import { pgSchema } from 'drizzle-orm/pg-core';

export const janus = pgSchema('janus');
export const janusTables = defineJanusTables({ schema: janus });
export const { users, logins, sessions, tokens, relations } = janusTables;
```

```ts
postgres: { db, tables: janusTables }
```

Without it, the kit looks for `users`, `logins`, `sessions`, `tokens` and
`relations` in the connection's `search_path`, `public` by default.

**`connectKit` checks that the five tables exist**, and refuses to start
otherwise:

```
connectKit: Janus's tables are missing from this database: "users", "logins", "sessions", "tokens", "relations". Apply the migration drizzle-kit generated from defineJanusTables(), to the database `postgres` names.
```

## `mongo`

Required on `@nxgt/janus-kit/mongo`, in place of `postgres`. Users,
relations, and sessions and tokens unless `redis` holds them.

```ts
import { connectKit, defineConfig } from '@nxgt/janus-kit/mongo';

mongo: { url: process.env.JANUS_MONGO_URL! }         // opened and closed by the kit
mongo: { url, clientOptions: { serverSelectionTimeoutMS: 15_000 } }
mongo: { db }                                          // a Db you opened, never closed by the kit
```

With `url`, the kit calls `@nxgt/mongo`'s `connectMongo` with
`{ serverSelectionTimeoutMS: 5_000, ...clientOptions }`. It must be a
`mongodb://` or `mongodb+srv://` URL, and **its path names the database**:
`mongodb://db.internal/janus`. Without a path, the driver uses `test`. A URL the driver cannot parse is a `TypeError`,
at once. Five seconds, where the driver waits thirty, makes a MongoDB that does not answer
fail at startup, and a request during an outage, as fast as Redis does
without its offline queue; raise it to ride out a replica-set election.
`clientOptions` is the driver's `MongoClientOptions`, and cannot be given
beside a `db`, whose client is already open with its own.

Use a replica set: `@nxgt/janus-mongo` writes a relation change of more than
one tuple in a transaction, which a standalone `mongod` refuses.

**`connectKit` compares the four collections** with `@nxgt/janus-mongo`'s
definitions by running `syncMongoAdapter(db, { dryRun: true })`, which writes
nothing. **A missing collection or index refuses to start**, naming each:

```
connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: users (missing), sessions (missing), tokens (missing), relations (missing). Run syncMongoAdapter(db), a deployment step, against the database `mongo` names.
```

A table missing in PostgreSQL fails the first query; a collection missing in
MongoDB is created by the first write, **without the unique index on
logins**, and two users could then share one. That is why the check is
stricter here.

A validator, an option or an index's options that differ **only warn**, with
the code `JANUS_KIT_COLLECTIONS_DRIFTED`: they differ in either direction, and
in a rolling deploy or a rollback the previous release meets the next one's
collections and must still start. Run `syncMongoAdapter(db)` where you deploy, as the migrations
of `/drizzle`: it needs the `dbAdmin` role, which the application's user
should not hold.

## `redis`

Optional. Sessions and one-time tokens in Redis, which expires them itself.
Users and relations stay in the database.

```ts
redis: { url: process.env.REDIS_URL! }                // opened and closed by the kit
redis: { url: process.env.REDIS_URL!, prefix: 'clinic:janus:', clientOptions: { tls: true } }
redis: { connection }                                 // from connectRedis, never closed by the kit
```

With `url`, the kit calls `@nxgt/redis`'s `connectRedis` with
`{ enableOfflineQueue: false, ...clientOptions }`. Without the offline queue,
a call during an outage fails at once, and a route answers 503, instead of
waiting about 31 seconds for Bun's client to give up. `clientOptions` is Bun's
`RedisOptions`, and cannot be given beside a `connection`, already open with
its own.

`prefix` starts every key, `janus:` by default. Two applications sharing one
Redis each take their own.

Absent, sessions and tokens stay in the database. On PostgreSQL, schedule
`kit.auth.collectExpired()` then: PostgreSQL has no TTL. On MongoDB, a TTL index
removes them, and `collectExpired()` answers `UNSUPPORTED`.

## `auth`

Required. It receives `{ store, relations }` and answers your `janus()`
instance. Spread it:

```ts
auth: (adapters) =>
	janus({
		users: {
			patient: { schema: Patient, password: { login: 'email' } },
			staff: { schema: Staff, password: { login: 'username' } },
		},
		hasher: scryptHasher(),
		...adapters,
	}),
```

`store` is users from PostgreSQL, and sessions and tokens from Redis when it is
wired. `relations` is the relation store: passed to `janus()`, deleting a user
deletes every tuple naming them. `kit.auth` is what you returned, with its
types: `kit.auth.staff.signIn` takes a `username`.

## `access`

Optional. It receives `{ relations, auth }`, `auth` being the instance above,
and answers your `permissions()` instance:

```ts
access: ({ relations, auth }) =>
	permissions({
		model: defineModel({
			subjects: auth.types, // 'patient' | 'staff'
			types: {
				record: {
					related: { doctors: ['staff'], patients: ['patient'] },
					permits: { view: ['doctors', 'patients'] },
				},
			},
		}),
		store: relations,
	}),
```

Absent, the kit has no `access`, and `kit.access` does not compile.

## `telemetry`

Optional. `true` wraps `auth` with `@nxgt/janus-telemetry`'s `instrumentJanus`
and `access` with `instrumentPermissions`: a span per flow and per check, and
the security events. The instances answer the same, with the same types.

`@nxgt/janus-telemetry` is an optional peer, loaded only then. Install it, and
`@nxgt/telemetry`, which it runs on:

```sh
bun add @nxgt/janus-telemetry @nxgt/telemetry
```
