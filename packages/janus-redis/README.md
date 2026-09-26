# @nxgt/janus-redis

The Redis adapter for [`@nxgt/janus`](https://www.npmjs.com/package/@nxgt/janus):
its **sessions** and **one-time tokens**, over one Redis, on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis)'s connection.

A session is read on every request, and a session and a token both expire,
which is what Redis is for. Users stay in another adapter, since they are
written once and kept. The store port is cut where atomicity is not required,
so no transaction ever spans the two.

It passes the `@nxgt/janus/conformance` suite for these two slots against a
real Redis 7.4, outages included.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-redis @nxgt/janus @nxgt/redis
bun add @nxgt/janus-drizzle @nxgt/drizzle drizzle-orm   # the users store in the example below — or @nxgt/janus-mongo
```

Users live in another adapter: this one holds sessions and one-time tokens
only.

Every peer is required:
- `@nxgt/janus`;
- `@nxgt/redis`, `>=0.3.1 <1`, whose connection wraps Bun's own `RedisClient`,
  so this runs on **Bun**;
- `typescript` 6.

`@nxgt/janus` is a **peer**, never a dependency. This package defines no error
class and throws the peer's own, so `instanceof StoreFailure` holds in your
code.

It needs **Redis 7.0 or later**, or Valkey, for `PEXPIREAT … GT` and
`SET … PXAT`.

Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

`@nxgt/redis` itself requires `zod` 4 as a peer. Add it too if your
application does not already use it: `bun add zod`.

## Usage

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { createDrizzleStores } from '@nxgt/janus-drizzle';
import { createRedisStores } from '@nxgt/janus-redis';
import { connectRedis } from '@nxgt/redis';
import { drizzle } from 'drizzle-orm/bun-sql';
import { z } from 'zod';

const db = drizzle(process.env.DATABASE_URL ?? 'postgres://localhost:5432/app');
const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  enableOfflineQueue: false, // an outage answers 503 at once, not after 31 s
});

export const auth = janus({
  user: z.object({ email: z.email(), name: z.string() }),
  password: { login: 'email' },
  hasher: scryptHasher(),
  store: {
    ...createDrizzleStores(db),   // users, sessions, tokens…
    ...createRedisStores(redis),  // …then sessions and tokens replaced by Redis
  },
});
```

The order of the spread matters: whatever comes last provides `sessions` and
`tokens`. `createMongoStores(db)` from `@nxgt/janus-mongo` works the same way.
[Wiring](docs/guide/wiring.md) covers the connection's options.

## API

| Export | What it is |
| --- | --- |
| `createRedisStores(redis, options?)` | Returns `{ sessions, tokens }`, the two slots of `janus()`'s `store`. `redis` is what `connectRedis` returns. It connects to nothing and creates nothing. |
| `RedisStoresOptions` | `{ prefix? }`: what every key starts with, `janus:` by default. |
| `RedisStores` | The type of what `createRedisStores` returns: `Pick<JanusStores, 'sessions' \| 'tokens'>`. |

## What Redis holds

Each key starts with the prefix, `janus:` unless you pass another.

| Key | Holds | Expires |
| --- | --- | --- |
| `session:<id>` | the session, as a hash | at the session's `expiresAt` |
| `session:token:<sha256>` | the session's id | with its session |
| `user:<userId>:sessions` | the ids of the user's sessions, as a set | with the user's longest session |
| `token:<sha256>` | the one-time token, as a hash: `kind`, `userId`, `address`, `codeHash`, `attempts`, the dates | at the token's `expiresAt` |
| `user:<userId>:tokens` | the hashes of the user's tokens, as a set | with the user's longest token |

No secret is stored: keys hold `sha256` of a session's or a token's secret,
never the secret. Dates are milliseconds since the epoch. A token written by
an earlier version has no `codeHash` or `attempts` field, and reads as `null`
and `0`: upgrading needs no migration.

**Every method that writes, and every read of more than one key, is one Lua
script.** Redis runs nothing else while a script runs, so `consumeToken`
spends a token and returns it as it was in one step. Of twenty concurrent
redemptions, exactly one sees `spentAt: null`. `countAttempt` is one script
too, `HINCRBY attempts` on an unspent token of the right kind, so twenty
concurrent attempts at a code answer twenty distinct counts. The scripts are
sent by SHA (`EVALSHA`), and in full only when Redis has forgotten them after
a restart, a failover or a `SCRIPT FLUSH`.

## Traps

- **By default, an outage takes 31 seconds to fail.** Bun's client queues
  commands while it reconnects, so every request waits until it gives up.
  Measured on Redis 7.4 stopped under a connected client:
  `ERR_REDIS_CONNECTION_CLOSED` after 31 s. With `enableOfflineQueue: false`
  the same call fails in 1 ms, and `janusErrors()` answers 503 at once.
- **`auth.collectExpired()` answers `UNSUPPORTED`** with this adapter. Redis
  expires every session and token key itself, so there is nothing to collect;
  `deleteExpiredSessions` is deliberately not implemented. Do not schedule it.
- **A lapsed session is gone, not revoked.** Redis drops a key when its expiry
  passes. The core refuses a lapsed session on every read regardless, so
  nothing changes for your users. But a session cannot be read once it has
  lapsed, not even by an admin page.
- **Eviction is data loss.** A Redis whose `maxmemory-policy` evicts keys can
  drop a standing session, which signs its user out, or a set, which hides
  sessions from "sign out everywhere". `volatile-*` policies are no safer:
  every key this adapter writes has an expiry, so every one is a candidate.
  Run this on a Redis with `noeviction`, or on one of its own.
- **Redis Cluster is not supported.** A script reads keys it finds on the way,
  a session's token key or a user's sessions, which may live in different
  slots.
- **`deleteUserSessions` and `revokeUserSessions` walk the user's set** in one
  script: a user with thousands of live sessions holds Redis for that long.
  The sets do not grow with sessions that lapsed: each insert drops the ones
  Redis already expired.
- **Persistence is yours to configure.** Without RDB or AOF, restarting Redis
  signs everybody out and forgets every pending reset token, which the port
  tolerates, since sessions are derived state. With AOF `everysec`, up to a
  second of revocations can be lost on a crash.

## Documentation

- [Guides](docs/README.md): wiring the stores beside another adapter, the connection's options, expiry
- [Troubleshooting](docs/troubleshooting.md): look up the error message you see
- [Roadmap](docs/roadmap.md): what is next, and what is not planned

## Type safety, counted

Three plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/stores.ts`:
- a URL instead of a connection;
- Bun's client instead of the connection that holds it;
- sessions and tokens alone passed as `janus()`'s whole `store`, with no users.

## Licence

MIT
