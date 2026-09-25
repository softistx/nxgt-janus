# @nxgt/janus-kit

[`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus) wired in one call:
users and permissions in PostgreSQL through
[`@nxgt/janus-drizzle`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/README.md), sessions and one-time tokens in
Redis through [`@nxgt/janus-redis`](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-redis/README.md), telemetry, a health check
and a close.

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { defineModel, permissions } from '@nxgt/janus/permissions';
import { connectKit, defineConfig } from '@nxgt/janus-kit';
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
              relations: { owner: ['user'], viewer: ['user'] },
              permissions: { view: ['owner', 'viewer'] },
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
bun add @nxgt/janus-kit @nxgt/janus @nxgt/drizzle drizzle-orm @nxgt/redis zod
bun add @nxgt/janus-telemetry @nxgt/telemetry  # only for telemetry: true
```

Required peers:
- `@nxgt/janus`;
- `@nxgt/drizzle` `>=0.6.1 <1` and `drizzle-orm` 1.0 (from `1.0.0-rc.4`), for
  PostgreSQL;
- `@nxgt/redis` `>=0.3.1 <1`, and `zod` 4 which it requires, even with
  sessions in PostgreSQL: the kit's types name its connection;
- `typescript` 6.

`@nxgt/janus-telemetry` is an optional peer, loaded only when `telemetry` is
`true`. `@nxgt/janus-drizzle` and `@nxgt/janus-redis` are dependencies: they
define no class, so one copy each is not required.

It runs on **Bun** only: the kit opens PostgreSQL over Bun's `SQL` and Redis
over Bun's `RedisClient`. It needs PostgreSQL 15 or later and Redis 7.0 or
later. Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

## API

| Export | What it is |
| --- | --- |
| `defineConfig(config)` | Checks the configuration and answers it, frozen. It connects to nothing and reads no environment variable. What is wrong throws a `TypeError` here, where the application starts. |
| `connectKit(config)` | Opens PostgreSQL and Redis, checks that Janus's five tables exist, builds `auth` and `access`, and answers the kit. Fails with an `Error` naming what to do, after closing what it opened. |
| `Kit` | What `connectKit` answers: `auth`; `access` when configured; `db`, the Drizzle instance; `redis`, the connection or `undefined`; `ping(options?)`; `close()`; and `[Symbol.asyncDispose]`. |
| `KitConfig`, `PostgresConfig`, `RedisConfig` | The configuration's types. |
| `Adapters`, `AccessWiring` | What `auth` and `access` are given: `{ store, relations }`, and `{ relations, auth }`. |
| `Health`, `PingResult` | What `ping` answers: `{ ok, postgres, redis? }`, each `{ ok: true, latencyMs }` or `{ ok: false, error }`. |

## The configuration

| Key | | |
| --- | --- | --- |
| `postgres` | required | `{ url }` of Janus's database, which the kit opens and closes; or `{ db }`, a Drizzle instance you opened, **never closed** by the kit. `tables`: what your schema file exports, when the tables are in a PostgreSQL schema of their own. |
| `redis` | optional | `{ url, prefix?, clientOptions? }`, which the kit opens with `enableOfflineQueue: false` and closes; or `{ connection, prefix? }`, which it never closes. Absent, sessions and tokens stay in PostgreSQL. |
| `telemetry` | optional | `true` wraps `auth` with `instrumentJanus` and `access` with `instrumentPermissions`. |
| `auth` | required | `(adapters) => janus({ …, ...adapters })`. |
| `access` | optional | `({ relations, auth }) => permissions({ model, store: relations })`. Absent, the kit has no `access`, and `kit.access` does not compile. |

`adapters` is `{ store, relations }`: users from PostgreSQL, sessions and
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
- **A Redis that is down at startup takes about 31 seconds to fail**, measured:
  Bun's client retries its first connection. At run time the kit's
  `enableOfflineQueue: false` makes an outage fail at once.
- **What you hand in, you close.** A `db` or a `connection` from the
  configuration is left open by `kit.close()`.
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

Eight plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/kit.ts`:
- `kit.access` on a kit configured without `access`;
- a user type `auth` does not have;
- a permission the model does not have;
- both `postgres.url` and `postgres.db`;
- both `redis.url` and `redis.connection`;
- `redis.clientOptions` beside a `connection` already open;
- `postgres.schema` instead of the tables built in it;
- a configuration without `auth`.

## Licence

MIT
