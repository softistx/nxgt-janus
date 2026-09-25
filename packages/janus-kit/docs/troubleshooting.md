# Troubleshooting `@nxgt/janus-kit`

Each entry is headed by the text you see: a compiler error or a message.
Search this page for the words of your message.

The kit **defines no error class**. A configuration it refuses is a
`TypeError`, from `defineConfig` or from `connectKit`, which checks it again;
a database it cannot reach is an `Error` from `connectKit`, whose `cause` is
what the driver threw. Once
connected, every error is `@nxgt/janus`'s, as documented in
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md)
and its adapters'.

## Index

**Types**
- [`TS2307: Cannot find module '@nxgt/janus-kit' or its corresponding type declarations.`](#ts2307-cannot-find-module-nxgtjanus-kit-or-its-corresponding-type-declarations)
- [`TS2339: Property 'access' does not exist on type 'Kit<…>'.`](#ts2339-property-access-does-not-exist-on-type-kit)
- [`TS2322: Type '{ url: string; db: PgDatabase; }' is not assignable to type 'PostgresConfig'.`](#ts2322-type--url-string-db-pgdatabase--is-not-assignable-to-type-postgresconfig)
- [`TS2322: Type '{ url: string; db: Db; }' is not assignable to type 'MongoConfig'.`](#ts2322-type--url-string-db-db--is-not-assignable-to-type-mongoconfig)
- [`TS2322: Type '{ db: Db; clientOptions: …; }' is not assignable to type 'MongoConfig'.`](#ts2322-type--db-db-clientoptions---is-not-assignable-to-type-mongoconfig)
- [`TS2353: Object literal may only specify known properties, and 'postgres' does not exist in type 'KitConfig<object, never>'.`](#ts2353-object-literal-may-only-specify-known-properties-and-postgres-does-not-exist-in-type-kitconfigobject-never)
- [`TS2339: Property 'postgres' does not exist on type 'HealthOf<"mongo">'.`](#ts2339-property-postgres-does-not-exist-on-type-healthofmongo)
- [`TS2322: Type 'RedisConnection' is not assignable to type 'undefined'.`](#ts2322-type-redisconnection-is-not-assignable-to-type-undefined)
- [`TS2353: Object literal may only specify known properties, and 'schema' does not exist in type …`](#ts2353-object-literal-may-only-specify-known-properties-and-schema-does-not-exist-in-type-)
- [`TS2345: Argument of type '{ postgres: …; }' is not assignable to parameter of type 'KitConfig<object, never>'.`](#ts2345-argument-of-type--postgres---is-not-assignable-to-parameter-of-type-kitconfigobject-never)
- [`TS2322: Type 'string' is not assignable to type 'boolean'.`](#ts2322-type-string-is-not-assignable-to-type-boolean)

**Starting**
- [`defineConfig: …`](#defineconfig-)
- [`connectKit: Janus's tables are missing from this database: …`](#connectkit-januss-tables-are-missing-from-this-database-)
- [`connectKit: PostgreSQL did not answer. …`](#connectkit-postgresql-did-not-answer-)
- [`` connectKit: the Drizzle instance in `postgres.db` did not answer. ``](#connectkit-the-drizzle-instance-in-postgresdb-did-not-answer)
- [`connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: …`](#connectkit-januss-collections-are-not-in-sync-with-nxgtjanus-mongo-)
- [`connectKit: Janus's collections differ from this @nxgt/janus-mongo's definitions: …`, a process warning](#connectkit-januss-collections-differ-from-this-nxgtjanus-mongos-definitions--a-process-warning)
- [`connectKit: MongoDB did not answer. …`](#connectkit-mongodb-did-not-answer-)
- [`` TypeError: connectKit: `mongo.url` is not a connection string the driver can read. ``](#typeerror-connectkit-mongourl-is-not-a-connection-string-the-driver-can-read)
- [`` connectKit: the Db in `mongo.db` did not answer. ``](#connectkit-the-db-in-mongodb-did-not-answer)
- [`TypeError: connectMongo: this URI is already connected with other options. …`](#typeerror-connectmongo-this-uri-is-already-connected-with-other-options-)
- [`connectKit: Redis did not answer. …`, after about 31 seconds](#connectkit-redis-did-not-answer--after-about-31-seconds)
- [`` connectKit: `telemetry: true` needs @nxgt/janus-telemetry … ``](#connectkit-telemetry-true-needs-nxgtjanus-telemetry-)
- [`TypeError: connectRedis: this URI is already connected with other options.`](#typeerror-connectredis-this-uri-is-already-connected-with-other-options)

**Running**
- [`STORE_FAILED` after `kit.close()`](#store_failed-after-kitclose)
- [`AggregateError: kit.close: several connections failed to close`](#aggregateerror-kitclose-several-connections-failed-to-close)
- [`connectKit: a connection failed to close after the kit failed to start: …`, a process warning](#connectkit-a-connection-failed-to-close-after-the-kit-failed-to-start--a-process-warning)

---

## Types

### `TS2307: Cannot find module '@nxgt/janus-kit' or its corresponding type declarations.`

**When:** you import from `@nxgt/janus-kit` itself. Bun, at run time, says
`Cannot find module '@nxgt/janus-kit'`.

**Why:** the package has no root entry: each database has its subpath, and
the import names it.

**Fix:** import from the subpath of your database.

```ts
import { connectKit, defineConfig } from '@nxgt/janus-kit/drizzle'; // PostgreSQL
import { connectKit, defineConfig } from '@nxgt/janus-kit/mongo';   // MongoDB
```

### `TS2339: Property 'access' does not exist on type 'Kit<…>'.`

**When:** `kit.access` on a kit whose configuration has no `access`.

**Why:** the kit has `access` only when you gave it a function to build it.

**Fix:** add `access`, or use permissions without the kit.

```ts
access: ({ relations, auth }) => permissions({ model: defineModel({ subjects: auth.types, types }), store: relations }),
```

### `TS2322: Type '{ url: string; db: PgDatabase; }' is not assignable to type 'PostgresConfig'.`

Also `Type '{}' is not assignable to type 'PostgresConfig'.`

**When:** `postgres: { url, db }`, or `postgres: {}`.

**Why:** the kit either opens the database, from `url`, or uses the one you
opened, `db`: one of the two, never both and never neither.

**Fix:** pass one. `url` is closed by `kit.close()`; `db` is yours to close.

### `TS2322: Type '{ url: string; db: Db; }' is not assignable to type 'MongoConfig'.`

Also `Type '{}' is not assignable to type 'MongoConfig'.`

**When:** `mongo: { url, db }`, or `mongo: {}`, on `@nxgt/janus-kit/mongo`.

**Why:** as for `postgres`: the kit opens the database from `url`, or uses the
`Db` you opened — one of the two.

**Fix:** pass one. `url` is closed by `kit.close()`; `db` is yours to close.

### `TS2322: Type '{ db: Db; clientOptions: …; }' is not assignable to type 'MongoConfig'.`

The compiler goes on: `Types of property 'clientOptions' are incompatible.`

**When:** `mongo: { db, clientOptions }`.

**Why:** the `Db`'s client is already open, with its own options.

**Fix:** pass the options where you created that client, or pass `url` and
let the kit open it with `clientOptions`.

### `TS2353: Object literal may only specify known properties, and 'postgres' does not exist in type 'KitConfig<object, never>'.`

**When:** `postgres: { … }` given to `defineConfig` from `@nxgt/janus-kit/mongo`.

**Why:** each subpath takes its own database's key.

**Fix:** import from the subpath of the database you configure.

### `TS2339: Property 'postgres' does not exist on type 'HealthOf<"mongo">'.`

**When:** `(await kit.ping()).postgres` on a MongoDB kit — a health route
written for PostgreSQL.

**Why:** `ping` names the database it probed: `mongo` there.

**Fix:** read `health.mongo`, or only `health.ok`, which every kit answers.

### `TS2322: Type 'RedisConnection' is not assignable to type 'undefined'.`

Also `Type '{ tls: true; }' is not assignable to type 'undefined'.`, on
`clientOptions`.

**When:** `redis: { url, connection }`, or `redis: { connection, clientOptions }`.

**Why:** a `connection` is already open, with its own options. The kit opens
one only from `url`, and only then are `clientOptions` used.

**Fix:** pass `url` and `clientOptions`, or `connection` alone, opened with
the options you want:

```ts
redis: { connection: await connectRedis(process.env.REDIS_URL!, { tls: true, enableOfflineQueue: false }) },
```

### `TS2353: Object literal may only specify known properties, and 'schema' does not exist in type …`

**When:** `postgres: { db, schema: 'janus' }`, or `schema: janus`.

**Why:** the kit takes the tables your schema file built, not the schema they
are in, so the tables the stores query are exactly the migration's.

**Fix:**

```ts
postgres: { db, tables: janusTables }, // export const janusTables = defineJanusTables({ schema: janus })
```

### `TS2345: Argument of type '{ postgres: …; }' is not assignable to parameter of type 'KitConfig<object, never>'.`

Followed by `Property 'auth' is missing in type …`.

**When:** `defineConfig` without `auth`.

**Why:** the kit wires `janus()`, it does not replace it: you write it, so its
types are inferred where you wrote it.

**Fix:**

```ts
auth: (adapters) => janus({ user: User, password: { login: 'email' }, hasher: scryptHasher(), ...adapters }),
```

### `TS2322: Type 'string' is not assignable to type 'boolean'.`

**When:** `telemetry: process.env.JANUS_TELEMETRY`, or `telemetry: 'true'`.

**Why:** `telemetry` is `true` or `false`, and an environment variable is a
string: `'false'` would turn it on.

**Fix:**

```ts
telemetry: process.env.JANUS_TELEMETRY === 'true',
```

---

## Starting

### `defineConfig: …`

The rest names the key: `` `postgres` needs url or db. ``, `` `redis` has both
url and connection. Pass one. ``, `` `redis.prefix` is a non-empty string. ``,
`` `auth` is required — (adapters) => janus({ …, ...adapters }). ``,
`` `postgres.url` is a postgres:// or postgresql:// URL, not mysql://. ``,
`` `mongo.url` is a mongodb:// or mongodb+srv:// URL, not postgres://. `` and the
like. It is a `TypeError`. `connectKit: …` with the same words is the same
check, run again on a configuration that did not go through `defineConfig`.

**When:** the configuration is checked, where your application starts. The
compiler refuses most of these first; they reach run time from JavaScript,
or from a value typed `any`, such as an environment variable read without `!`
turning out empty.

**Why:** each is a configuration the kit cannot run with.

**Fix:** what the message says. An empty `url` usually means an environment
variable that is not set:

```ts
const url = process.env.JANUS_DATABASE_URL;
if (!url) throw new Error('JANUS_DATABASE_URL is not set');
```

### `connectKit: Janus's tables are missing from this database: …`

The rest lists them, `"users", "logins", …`, or `"janus"."users", …` with
`postgres.tables` in a schema of their own.

**When:** `connectKit`, on a database without the tables.

**Why:** one of three things:
- the migration drizzle-kit generated from `defineJanusTables()` was never
  applied;
- it was applied to another database: your application's, not Janus's;
- the tables are in a PostgreSQL schema, and `postgres.tables` was not given,
  so the kit looked in `public`.

**Fix:** apply the migration to the database `postgres` names, or pass
`postgres.tables`. [`@nxgt/janus-drizzle`'s guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/database.md)
has both setups.

```sh
bunx drizzle-kit migrate --config drizzle.janus.config.ts
```

### `connectKit: PostgreSQL did not answer. …`

The message goes on: `` Check `postgres.url`, and that the database exists. ``
`cause` is the driver's error.

**When:** `connectKit`, when the first query fails: a host that refuses the
connection (measured: 5 ms), a wrong password, a database that does not exist.

**Why:** the kit checks the tables before anything else, so an unreachable
database fails here, not at the first sign-in.

**Fix:** read `error.cause` for the driver's reason, and check the URL. The
URL is not in the message: it may hold a password.

### `` connectKit: the Drizzle instance in `postgres.db` did not answer. ``

`cause` is the driver's error.

**When:** `connectKit` with `postgres: { db }`, when the first query on it
fails: its client closed already, or its connection refused.

**Why:** the kit checks the tables on the instance you handed in before
building anything on it.

**Fix:** read `error.cause`, and check the instance where you opened it.

### `connectKit: Janus's collections are not in sync with @nxgt/janus-mongo: …`

The rest names each collection and what it lacks — `users (missing)`, or
`users (indexes)` for an index that is not there — then `` Run
syncMongoAdapter(db), a deployment step, against the database `mongo` names. ``

**When:** `connectKit` from `@nxgt/janus-kit/mongo`, on a database where
`syncMongoAdapter(db, { dryRun: true })` would create a collection or an
index. Anything else that differs is [only a warning](#connectkit-januss-collections-differ-from-this-nxgtjanus-mongos-definitions--a-process-warning).

**Why:** one of three things:
- `syncMongoAdapter` never ran against this database: every collection is
  `missing`;
- it ran against another one — the URL has no path, and the driver used
  `test`;
- `@nxgt/janus-mongo` was upgraded and added an index, or one was dropped by
  hand. A missing login index is the dangerous one: two users could share a
  login.

**Fix:** run the sync where you deploy, with a user that holds `dbAdmin`, and
name the database in the URL:

```ts
import { syncMongoAdapter } from '@nxgt/janus-mongo';
import { connectMongo } from '@nxgt/mongo';

await using mongo = await connectMongo(process.env.JANUS_MONGO_ADMIN_URL!); // mongodb://…/janus
console.log(await syncMongoAdapter(mongo.db));
```

### `connectKit: Janus's collections differ from this @nxgt/janus-mongo's definitions: …`, a process warning

The rest names each collection and what differs — `users (validator)`,
`sessions (indexes)`, `tokens (options)` — then `` Run syncMongoAdapter(db)
once every instance runs this version. `` Its code is
`JANUS_KIT_COLLECTIONS_DRIFTED`. The kit starts.

**When:** `connectKit`, on collections whose validator, options or index
options differ from the definitions of the `@nxgt/janus-mongo` this process
loaded — in either direction.

**Why:** in a rolling deploy or a rollback, one release meets the collections
another one synced. Refusing to start there would stop the release you are
rolling back to; a missing collection or index, which makes the stores
unsafe, [still refuses](#connectkit-januss-collections-are-not-in-sync-with-nxgtjanus-mongo-).

**Fix:** once every instance runs the same version, run `syncMongoAdapter(db)`
where you deploy. To act on it, listen:

```ts
process.on('warning', (warning) => {
  if ((warning as { code?: string }).code === 'JANUS_KIT_COLLECTIONS_DRIFTED') log.warn(warning.message);
});
```

### `connectKit: MongoDB did not answer. …`

The message goes on: `` Check `mongo.url`, and that the server is reachable. ``
`cause` is the driver's error, a `MongoServerSelectionError` for a server
that refuses the connection.

**When:** `connectKit` with `mongo.url`, when the driver finds no server
within `serverSelectionTimeoutMS`: 5 s, the kit's, measured; 30 s is the
driver's own.

**Why:** the kit connects and compares the collections before anything else,
so an unreachable database fails here, not at the first sign-in.

**Fix:** read `error.cause` for the driver's reason, and check the URL. The
URL is not in the message: it may hold a password.

### `` TypeError: connectKit: `mongo.url` is not a connection string the driver can read. ``

`cause` is the driver's `MongoParseError` or `MongoRuntimeError`.

**When:** `connectKit` with a `mongo.url` the driver cannot parse — a port
that is not a number, an `@` in an unencoded password — at once, before any
server is contacted.

**Why:** a URL that cannot be read is a wiring mistake, not an outage, as
`/drizzle` reports one for `postgres.url`.

**Fix:** read `error.cause`, and encode the password:

```ts
const url = `mongodb://janus:${encodeURIComponent(password)}@db.internal/janus`;
```

### `` connectKit: the Db in `mongo.db` did not answer. ``

`cause` is the driver's error.

**When:** `connectKit` with `mongo: { db }`, when comparing the collections
fails: its client closed already, or it cannot reach a server.

**Why:** the kit compares the collections of the `Db` you handed in before
building anything on it.

**Fix:** read `error.cause`, and check the client where you opened it.

### `TypeError: connectMongo: this URI is already connected with other options. …`

**When:** `connectKit` with `mongo.url`, when your application already
connected to the same URL with `connectMongo` and other options — without the
kit's `serverSelectionTimeoutMS: 5_000`, for instance.

**Why:** `@nxgt/mongo` shares one client per URL, and one client has one set
of options. The kit passes the refusal through as it is.

**Fix:** give the same options in both places, give Janus a URL of its own,
or open it yourself and pass `{ db }`:

```ts
mongo: { db: mongo.db }, // your connectMongo(…) connection, closed by you
```

### `connectKit: Redis did not answer. …`, after about 31 seconds

The message goes on: `` Check `redis.url`, or leave `redis` out to keep sessions in PostgreSQL. ``
(`MongoDB` from `@nxgt/janus-kit/mongo`). `cause` is Bun's `Connection closed`.

**When:** `connectKit`, with `redis.url` pointing at a Redis that is down or
unreachable.

**Why:** Bun's client retries its first connection before it gives up:
31.2 s measured, with the kit's `enableOfflineQueue: false`.

**Fix:** start Redis, or check the URL. The database connection the kit
opened is closed before the error leaves.

### `` connectKit: `telemetry: true` needs @nxgt/janus-telemetry … ``

**When:** `telemetry: true`, without `@nxgt/janus-telemetry` installed.

**Why:** it is an optional peer, loaded only when telemetry is asked for.

**Fix:**

```sh
bun add @nxgt/janus-telemetry @nxgt/telemetry
```

### `TypeError: connectRedis: this URI is already connected with other options.`

**When:** `connectKit` with `redis.url`, while your application holds a
connection to the same URL, opened with other options.

**Why:** `@nxgt/redis` shares one client per URL, with one set of options, and
the kit connects with `enableOfflineQueue: false`.

**Fix:** pass the kit your connection, `redis: { connection }`, or give Janus
its own URL, another database number for instance: `redis://localhost:6379/1`.

---

## Running

### `STORE_FAILED` after `kit.close()`

**When:** a call through `kit.auth` or `kit.access` after the kit was closed:
a request still in flight during shutdown, or a test that closed the kit
early.

**Why:** the connections the kit opened are closed, so every store call fails,
and a failure is never answered as an absence.

**Fix:** stop taking requests before closing the kit, for instance after your
server's `stop()` resolves.

### `AggregateError: kit.close: several connections failed to close`

`errors` holds each one. A single failure rejects with that error alone.

**When:** `kit.close()`, when closing Redis and the database both failed.

**Why:** `close()` tries every connection it opened before it reports, so one
failure never leaves another open.

**Fix:** log `error.errors` at shutdown; there is nothing to retry.

### `connectKit: a connection failed to close after the kit failed to start: …`, a process warning

Its code is `JANUS_KIT_CLOSE_FAILED`. The rest is the close's error.

**When:** `connectKit` failed, and closing a connection it had opened on the
way failed too.

**Why:** the error that stopped the kit is the one `connectKit` rejects with;
a failure to clean up after it is reported beside it, as a process warning.

**Fix:** fix the first error. The warning tells you a connection may have been
left open until the process exits.
