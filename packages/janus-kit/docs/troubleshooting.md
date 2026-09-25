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
- [`TS2339: Property 'access' does not exist on type 'Kit<…>'.`](#ts2339-property-access-does-not-exist-on-type-kit)
- [`TS2322: Type '{ url: string; db: PgDatabase; }' is not assignable to type 'PostgresConfig'.`](#ts2322-type--url-string-db-pgdatabase--is-not-assignable-to-type-postgresconfig)
- [`TS2322: Type 'RedisConnection' is not assignable to type 'undefined'.`](#ts2322-type-redisconnection-is-not-assignable-to-type-undefined)
- [`TS2353: Object literal may only specify known properties, and 'schema' does not exist in type …`](#ts2353-object-literal-may-only-specify-known-properties-and-schema-does-not-exist-in-type-)
- [`TS2345: Argument of type '{ postgres: …; }' is not assignable to parameter of type 'KitConfig<object, never>'.`](#ts2345-argument-of-type--postgres---is-not-assignable-to-parameter-of-type-kitconfigobject-never)
- [`TS2322: Type 'string' is not assignable to type 'boolean'.`](#ts2322-type-string-is-not-assignable-to-type-boolean)

**Starting**
- [`defineConfig: …`](#defineconfig-)
- [`connectKit: Janus's tables are missing from this database: …`](#connectkit-januss-tables-are-missing-from-this-database-)
- [`connectKit: PostgreSQL did not answer. …`](#connectkit-postgresql-did-not-answer-)
- [`` connectKit: the Drizzle instance in `postgres.db` did not answer. ``](#connectkit-the-drizzle-instance-in-postgresdb-did-not-answer)
- [`connectKit: Redis did not answer. …`, after about 31 seconds](#connectkit-redis-did-not-answer--after-about-31-seconds)
- [`` connectKit: `telemetry: true` needs @nxgt/janus-telemetry … ``](#connectkit-telemetry-true-needs-nxgtjanus-telemetry-)
- [`TypeError: connectRedis: this URI is already connected with other options.`](#typeerror-connectredis-this-uri-is-already-connected-with-other-options)

**Running**
- [`STORE_FAILED` after `kit.close()`](#store_failed-after-kitclose)
- [`AggregateError: kit.close: several connections failed to close`](#aggregateerror-kitclose-several-connections-failed-to-close)
- [`connectKit: a connection failed to close after the kit failed to start: …`, a process warning](#connectkit-a-connection-failed-to-close-after-the-kit-failed-to-start--a-process-warning)

---

## Types

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
`` `postgres.url` is a postgres:// or postgresql:// URL, not mysql://. `` and the
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

### `connectKit: Redis did not answer. …`, after about 31 seconds

The message goes on: `` Check `redis.url`, or leave `redis` out to keep sessions in PostgreSQL. `` `cause` is Bun's `Connection closed`.

**When:** `connectKit`, with `redis.url` pointing at a Redis that is down or
unreachable.

**Why:** Bun's client retries its first connection before it gives up:
31.2 s measured, with the kit's `enableOfflineQueue: false`.

**Fix:** start Redis, or check the URL. The PostgreSQL connection the kit
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

**When:** `kit.close()`, when closing Redis and PostgreSQL both failed.

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
