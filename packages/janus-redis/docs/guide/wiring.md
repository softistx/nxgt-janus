# Wiring sessions and tokens to Redis

This page covers:
- putting `@nxgt/janus`'s sessions and one-time tokens in Redis, beside the
  store that keeps your users;
- the connection options that matter;
- what a failure looks like.

## Beside another users store

`createRedisStores(redis)` returns `{ sessions, tokens }`, two of the three
slots of `janus()`'s `store`. The third, `users`, comes from another adapter.
Spread that one first, then this one:

```ts
import { janus, scryptHasher } from '@nxgt/janus';
import { createDrizzleStores } from '@nxgt/janus-drizzle';
import { createRedisStores } from '@nxgt/janus-redis';
import { connectRedis } from '@nxgt/redis';
import { drizzle } from 'drizzle-orm/bun-sql';
import { z } from 'zod';

const db = drizzle(process.env.DATABASE_URL ?? 'postgres://localhost:5432/app');
const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	enableOfflineQueue: false,
});

export const auth = janus({
	user: z.object({ email: z.email(), name: z.string() }),
	password: { login: 'email' },
	hasher: scryptHasher(),
	store: {
		...createDrizzleStores(db), // users — and sessions and tokens, replaced below
		...createRedisStores(redis), // sessions and tokens
	},
});
```

The same works with `createMongoStores(db)` from `@nxgt/janus-mongo`, or with a
`users` store of your own. The core never writes a user and a session in one
transaction, so nothing is lost by keeping them in two databases.

To wire permissions, pass `relations` from the users' adapter as usual:
`createDrizzleAdapter(db)` and `createMongoAdapter(db)` both return it.

## `createRedisStores(redis, options?)`

```ts
function createRedisStores(
	redis: RedisConnection, // what connectRedis returns
	options?: { prefix?: string }, // 'janus:' by default
): { sessions: SessionStore; tokens: TokenStore };
```

It connects to nothing and creates nothing: the keys are made by the first
write, and Redis needs no schema. `redis` is `@nxgt/redis`'s connection, and
its client is Bun's `RedisClient`, so this runs on Bun.

`prefix` starts every key. Two applications sharing one Redis each take their
own, as do the tests of one application:

```ts
createRedisStores(redis, { prefix: 'clinic:janus:' });
```

## The connection's options

`connectRedis(uri, options)` takes Bun's `RedisOptions`. One of them decides
how an outage looks to your users:

| `enableOfflineQueue` | While Redis is unreachable | Measured on Redis 7.4 |
| --- | --- | --- |
| `true`, Bun's default | Every command waits while the client reconnects, then fails | `STORE_FAILED` after **31 s** |
| `false` | Every command fails at once | `STORE_FAILED` in **1 ms** |

With `false`, a request during an outage gets a 503 it can retry, instead of
holding a connection open for half a minute. The trade-off: a blip of a few
milliseconds fails the requests that land in it.

`connectRedis` shares one client per URI, and refuses a second connection to
the same URI with other options. If your application already connects to this
Redis, pass the same options everywhere, or give Janus a URI of its own, for
example another database number: `redis://localhost:6379/1`.

## Expiry

Every session and token key expires at its own `expiresAt`, set with
`PEXPIREAT` when it is written, and moved when `extendSession` renews it.
Redis deletes it then. The core decides expiry on every read anyway, so a
lapsed session is refused whether Redis has deleted it yet or not.

This is why `sessions.deleteExpiredSessions` is not implemented, and
`auth.collectExpired()` answers `UNSUPPORTED`: there is nothing left to
collect.

A revoked session stays until its expiry, so that its revocation is what a
read returns.

A user's set of sessions, and of tokens, lives as long as the longest of
them. An id whose key Redis expired stays in the set until the user's next
sign-in or token, which drops it, so a set holds live entries and the few
that lapsed since.

## What a failure looks like

The adapter defines **no error class**. Every rejection is `@nxgt/janus`'s
`StoreFailure`, whose `cause` is what Bun's client threw:

| What happens | What you get |
| --- | --- |
| Redis is unreachable, the connection closed, a timeout | `StoreFailure`; `cause` is Bun's `RedisError`, such as `ERR_REDIS_CONNECTION_CLOSED` |
| Redis refuses the command: `NOPERM`, `OOM`, `READONLY` on a replica | `StoreFailure`; `cause` carries Redis's reply |
| A session token hash already held by another session | `StoreFailure`: it is not a retry, and never happens with the core's 32 random bytes |
| A key under the prefix that this adapter did not write | `StoreFailure` naming the call, with no `cause`: never read as an absence |

Nothing returns `null` for an error, so a route answers 503, not 401. With
`@nxgt/janus-hono`, `app.onError(janusErrors())` does that for every route.
