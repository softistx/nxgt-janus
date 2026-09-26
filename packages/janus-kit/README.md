# @nxgt/janus-kit

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) wired in one call:
users and permissions in PostgreSQL through
[`@nxgt/janus-drizzle`](https://www.npmjs.com/package/@nxgt/janus-drizzle) or in MongoDB through
[`@nxgt/janus-mongo`](https://www.npmjs.com/package/@nxgt/janus-mongo), sessions and one-time tokens in
Redis through [`@nxgt/janus-redis`](https://www.npmjs.com/package/@nxgt/janus-redis), telemetry, a health check
and a close.

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { connectKit, defineConfig } from '@nxgt/janus-kit/drizzle';
import { z } from 'zod';

export const kit = await connectKit(
  defineConfig({
    postgres: { url: process.env.JANUS_DATABASE_URL! }, // Janus's own database
    redis: { url: process.env.REDIS_URL! },             // optional: sessions and tokens
    telemetry: true,                                    // optional: @nxgt/janus-telemetry
    auth: (adapters) =>
      janus({
        user: z.object({ email: z.email(), name: z.string() }),
        password: { login: 'email' },
        hasher: scryptHasher(),
        ...adapters, // { store, relations }
      }),
    access: ({ relations, auth }) =>
      permissions({
        model: defineModel({
          subjects: auth.types,
          types: {
            document: {
              related: { owners: ['user'], viewers: ['user'] },
              permits: { view: ['owners', 'viewers'] },
            },
          },
        }),
        store: relations,
      }),
  }),
);

const current = await kit.auth.authenticate(request); // null when signed out
if (current) await kit.access.can(current.user, 'view', { type: 'document', id: 'd1' });
const health = await kit.ping(); // { ok, postgres, redis } — never throws
await kit.close();
```

**You still write `janus()` and `permissions()`**, in the two functions, so
every type they infer is inferred where you wrote them: `kit.auth.signIn`
takes your login field, `kit.access.can` your permissions. The kit hands them
the stores, opens and closes the connections, and checks at startup what
would otherwise fail at the first sign-in.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-kit @nxgt/janus @nxgt/redis zod
bun add @nxgt/janus-drizzle @nxgt/drizzle drizzle-orm   # for @nxgt/janus-kit/drizzle
bun add @nxgt/janus-mongo @nxgt/mongo mongodb           # for @nxgt/janus-kit/mongo
bun add @nxgt/janus-telemetry @nxgt/telemetry           # only for telemetry: true
bun add -d @types/bun                                   # the kit's types name Bun's RedisOptions
```

Required peers, whichever subpath:
- `@nxgt/janus`;
- `@nxgt/redis` `>=0.3.1 <1`, and `zod` 4 which it requires, even with
  sessions in the database: the kit's types name its connection;
- `typescript` 6.

Peers of `@nxgt/janus-kit/drizzle` — optional in `package.json`, so an
application on another subpath does not install them, but required by this
one:
- `@nxgt/janus-drizzle`: your schema file imports `defineJanusTables` from it
  to create the tables, and the kit's stores must query the same definition;
- `@nxgt/drizzle` `>=0.6.1 <1` and `drizzle-orm` 1.0 (from `1.0.0-rc.4`), for
  PostgreSQL.

Peers of `@nxgt/janus-kit/mongo`, optional in the same way:
- `@nxgt/janus-mongo`: `syncMongoAdapter` creates the collections, and the
  kit's stores must query the same definitions;
- `@nxgt/mongo` `>=0.17.0 <1` and `mongodb` 7.

`@nxgt/janus-telemetry` is an optional peer, loaded only when `telemetry` is
`true`. `@nxgt/janus-redis` is a dependency: your code never imports it.

It runs on **Bun** only: the kit opens PostgreSQL over Bun's `SQL` and Redis
over Bun's `RedisClient`. It needs PostgreSQL 15 or later, or MongoDB as a
replica set, and Redis 7.0 or later. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## Subpaths

**One kit, one subpath per database.** The package has **no root entry**, so
the import names the database: `import … from '@nxgt/janus-kit'` fails with
`TS2307`. Redis, telemetry, `ping` and `close` are the same whichever subpath
you use.

| Subpath | Database | The database key | What `connectKit` checks |
| --- | --- | --- | --- |
| `@nxgt/janus-kit/drizzle` | PostgreSQL, through `@nxgt/janus-drizzle` | `postgres` | Janus's five tables exist |
| `@nxgt/janus-kit/mongo` | MongoDB, through `@nxgt/janus-mongo` | `mongo` | Janus's four collections and their indexes exist; any other difference is a warning |

On MongoDB, the example above changes in its first lines only:

```ts
import { connectKit, defineConfig } from '@nxgt/janus-kit/mongo';

export const kit = await connectKit(
  defineConfig({
    mongo: { url: process.env.JANUS_MONGO_URL! }, // mongodb://…/janus — the path names the database
    redis: { url: process.env.REDIS_URL! },
    auth: (adapters) => janus({ /* … */ ...adapters }),
  }),
);
kit.db; // the Db; (await kit.ping()).mongo
```

## API

Both subpaths export the same names; they differ in the database key and
what `db` is.

| Export | What it is |
| --- | --- |
| `defineConfig(config)` | Checks the configuration and answers it, frozen. It connects to nothing and reads no environment variable. What is wrong throws a `TypeError` here, where the application starts. |
| `connectKit(config)` | Checks the configuration again, opens the database and Redis, checks Janus's tables or collections, builds `auth` and `access`, and answers the kit. Fails with an `Error` naming what to do — a `TypeError` for a URL it cannot read — after closing what it opened. |
| `Kit` | What `connectKit` answers: `auth`; `access` when configured; `db`, the Drizzle instance or the MongoDB `Db`; `redis`, the connection or `undefined`; `ping(options?)`; `close()`; and `[Symbol.asyncDispose]`. |
| `KitConfig`, `RedisConfig`, and `PostgresConfig` from `/drizzle` or `MongoConfig` from `/mongo` | The configuration's types. |
| `Adapters`, `AccessWiring` | What `auth` and `access` are given: `{ store, relations }`, and `{ relations, auth }`. |
| `Health`, `PingResult` | What `ping` answers: `{ ok, postgres, redis? }` or `{ ok, mongo, redis? }`, each `{ ok: true, latencyMs }` or `{ ok: false, error }`. |

## The configuration

| Key | | |
| --- | --- | --- |
| `postgres` | required on `/drizzle` | `{ url }` of Janus's database, a `postgres://` or `postgresql://` URL, which the kit opens and closes; or `{ db }`, a Drizzle instance you opened, **never closed** by the kit. `tables`: what your schema file exports, when the tables are in a PostgreSQL schema of their own. |
| `mongo` | required on `/mongo` | `{ url, clientOptions? }` of Janus's database, a `mongodb://` or `mongodb+srv://` URL whose path names the database, which the kit opens with `serverSelectionTimeoutMS: 5_000` and closes; or `{ db }`, a `Db` you opened, **never closed** by the kit. |
| `redis` | optional | `{ url, prefix?, clientOptions? }`, which the kit opens with `enableOfflineQueue: false` and closes; or `{ connection, prefix? }`, which it never closes. Absent, sessions and tokens stay in the database. |
| `telemetry` | optional | `true` wraps `auth` with `instrumentJanus` and `access` with `instrumentPermissions`. |
| `auth` | required | `(adapters) => janus({ …, ...adapters })`. |
| `access` | optional | `({ relations, auth }) => permissions({ model, store: relations })`. Absent, the kit has no `access`, and `kit.access` does not compile. |

`adapters` is `{ store, relations }`: users from the database, sessions and
tokens from Redis when it is wired, and the relation store, so deleting a user
deletes every tuple naming them. [The configuration guide](docs/guide/configuration.md)
has each key in detail.

## Traps

- **Janus's tables come from your migrations.** `connectKit` checks that all
  five exist and refuses to start otherwise, naming them. Create them with
  drizzle-kit, from `defineJanusTables()`, as
  [`@nxgt/janus-drizzle`'s guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/database.md)
  shows.
- **In a PostgreSQL schema of their own, pass `postgres.tables`.** Without it,
  the kit looks for, and the stores query, `users` in the connection's
  `search_path`: `public`, where your application may have a `users` of its
  own.
- **Janus's collections come from `syncMongoAdapter`**, a deployment step.
  `connectKit` compares them with `@nxgt/janus-mongo`'s definitions, writing
  nothing. A missing collection or index refuses to start: MongoDB would
  create a missing collection on the first write **without the unique index
  on logins**. A validator, an option or an index's options that differ only warn
  (`JANUS_KIT_COLLECTIONS_DRIFTED`), so a rollback still starts.
- **`kit.auth.collectExpired()` answers `UNSUPPORTED` on `/mongo`**: a TTL
  index removes lapsed sessions and tokens there. Schedule it on PostgreSQL
  only.
- **A MongoDB URL without a database in its path uses `test`**, the driver's
  default. Name Janus's database in the URL: `mongodb://…/janus`.
- **A MongoDB that does not answer fails after 5 seconds**, measured: the
  kit's `serverSelectionTimeoutMS`, where the driver's own is 30. A request
  during a replica-set election can fail rather than wait; pass
  `clientOptions: { serverSelectionTimeoutMS }` to wait longer.
- **A Redis that is down at startup takes about 31 seconds to fail**, measured:
  Bun's client retries its first connection. At run time the kit's
  `enableOfflineQueue: false` makes an outage fail at once.
- **What you hand in, you close.** A `db` or a `connection` from the
  configuration is left open by `kit.close()`.
- **`@nxgt/mongo` shares one client per URL**, as `@nxgt/redis` does below:
  connecting to Janus's MongoDB URL elsewhere with other options is refused.
- **`@nxgt/redis` shares one client per URL.** If your application connects
  to the same Redis URL with other options, `connectRedis` refuses the
  second. Give Janus its own URL, another database number for instance, or
  pass `{ connection }`.

## Documentation

- [Guides](docs/README.md): every key of the configuration, the health check,
  and closing
- [Troubleshooting](docs/troubleshooting.md): look up the error message you see
- [Roadmap](docs/roadmap.md): what is next, and what is not planned

## Type safety, counted

Sixteen plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case: ten in `test/types/kit.ts`, over PostgreSQL,
- `kit.access` on a kit configured without `access`;
- a user type `auth` does not have;
- a permission the model does not have;
- both `postgres.url` and `postgres.db`;
- both `redis.url` and `redis.connection`;
- `redis.clientOptions` beside a `connection` already open;
- `postgres.schema` instead of the tables built in it;
- a configuration without `auth`;
- `postgres` with neither `url` nor `db`;
- `telemetry` as a string, as an environment variable reads;

and six in `test/types/mongo.ts`, over MongoDB:
- `kit.access` on a kit configured without `access`;
- `ping()`'s `postgres` on a MongoDB kit, which answers `mongo`;
- both `mongo.url` and `mongo.db`;
- `mongo.clientOptions` beside a `Db` whose client is already open;
- the `postgres` key given to the MongoDB kit;
- `mongo` with neither `url` nor `db`.

## Licence

MIT
