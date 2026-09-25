# Troubleshooting `@nxgt/janus-redis`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

This adapter **defines no error class**. Every error it throws is
`@nxgt/janus`'s `StoreFailure`, with what Bun's Redis client threw as its
`cause`. The errors the core raises itself (`CREDENTIALS_INVALID`,
`TOKEN_EXPIRED`, …) are in
[`@nxgt/janus`'s troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus/docs/troubleshooting.md).

## Index

**Types**
- [`TS2345: Argument of type '…' is not assignable to parameter of type 'RedisConnection'.`](#ts2345-argument-of-type--is-not-assignable-to-parameter-of-type-redisconnection)
- [`TS2741: Property 'users' is missing in type 'RedisStores' but required in type 'JanusStores'.`](#ts2741-property-users-is-missing-in-type-redisstores-but-required-in-type-janusstores)

**Runtime**
- [`STORE_FAILED` after about 31 seconds, caused by `Max reconnection attempts reached`](#store_failed-after-about-31-seconds-caused-by-max-reconnection-attempts-reached)
- [`STORE_FAILED`: `sessions.<operation>: the store could not answer`](#store_failed-sessionsoperation-the-store-could-not-answer)
- [`STORE_FAILED`: `sessions.<operation>: a reply that is not … — a key under the prefix this adapter did not write`](#store_failed-sessionsoperation-a-reply-that-is-not---a-key-under-the-prefix-this-adapter-did-not-write)
- [`CROSSSLOT Keys in request don't hash to the same slot`, or `Script attempted to access a non local key in a cluster node`](#crossslot-keys-in-request-dont-hash-to-the-same-slot-or-script-attempted-to-access-a-non-local-key-in-a-cluster-node)
- [Users are signed out while Redis is up, under memory pressure](#users-are-signed-out-while-redis-is-up-under-memory-pressure)
- [`UNSUPPORTED`: `collectExpired: store.sessions does not implement deleteExpiredSessions …`](#unsupported-collectexpired-storesessions-does-not-implement-deleteexpiredsessions-)
- [`TypeError: connectRedis: this URI is already connected with other options.`](#typeerror-connectredis-this-uri-is-already-connected-with-other-options)
- [Users are signed out after Redis restarts](#users-are-signed-out-after-redis-restarts)

---

## Types

### `TS2345: Argument of type '…' is not assignable to parameter of type 'RedisConnection'.`

`'…'` is `'string'` for a URL, or `RedisClient` for Bun's client.

**When:** you pass `createRedisStores` a URL, or a `RedisClient` you created
yourself.

**Why:** the adapter takes the connection `@nxgt/redis`'s `connectRedis`
returns, and connects to nothing itself.

**Fix:**

```ts
import { connectRedis } from '@nxgt/redis';

const stores = createRedisStores(await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379'));
```

### `TS2741: Property 'users' is missing in type 'RedisStores' but required in type 'JanusStores'.`

**When:** `janus({ store: createRedisStores(redis) })`.

**Why:** this adapter serves sessions and tokens only. Users need a store of
their own.

**Fix:** spread a users store first, then this one.

```ts
store: { ...createDrizzleStores(db), ...createRedisStores(redis) },
```

---

## Runtime

### `STORE_FAILED` after about 31 seconds, caused by `Max reconnection attempts reached`

**When:** Redis is unreachable, and each request hangs for about half a minute
before it answers 503.

**Why:** Bun's client queues commands while it reconnects, and fails them only
once it gives up, after about 31 s measured.

**Fix:** turn the queue off for Janus's connection, so an outage fails at once
(1 ms measured):

```ts
const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	enableOfflineQueue: false,
});
```

### `STORE_FAILED`: `sessions.<operation>: the store could not answer`

Also `tokens.<operation>: …`.

**When:** any call, for as long as Redis cannot answer: unreachable, out of
memory (`OOM`), a replica that refuses writes (`READONLY`), a user without the
right (`NOPERM`). With `enableOfflineQueue: false`, an outage's `cause` reads
`Connection is closed and offline queue is disabled`.

**Why:** the adapter never turns a failure into an absence. An outage is not
"no such session", which would sign every user out.

**Fix:** answer 503 and let the client retry. Log `cause` for Redis's reply.

```ts
import { StoreFailure } from '@nxgt/janus';

if (error instanceof StoreFailure) console.error(error.slot, error.operation, error.cause);
```

A Redis user restricted by ACL needs `+@scripting` and the commands the scripts
run (`HSET`, `HGET`, `HGETALL`, `EXISTS`, `GET`, `SET`, `DEL`, `SADD`, `SREM`,
`SMEMBERS`, `PTTL`, `PEXPIREAT`), on the keys `~janus:*`, or `~<your prefix>*`.

### `STORE_FAILED`: `sessions.<operation>: a reply that is not … — a key under the prefix this adapter did not write`

Also `tokens.<operation>: …`, and `… not a date in \`expiresAt\``, `… not a
hash with \`userId\``, and the like.

**When:** Redis answered, but a key under the prefix holds something this
adapter did not write: a key set by hand, another application using the same
prefix, or a key written by another version.

**Why:** a record it cannot read is a failure, never an absence — answering
`null` would sign a user out, or refuse a valid reset link. There is no
`cause`: Redis did not fail.

**Fix:** give Janus a prefix no other code writes under, and delete the
foreign keys:

```ts
createRedisStores(redis, { prefix: 'clinic:janus:' });
```

### `CROSSSLOT Keys in request don't hash to the same slot`, or `Script attempted to access a non local key in a cluster node`

The message is the `cause` of a `STORE_FAILED`.

**When:** Janus's Redis is a Redis Cluster.

**Why:** a script reads keys it finds on the way, a session's token key or a
user's set, which live in different hash slots. Cluster is not supported.

**Fix:** give Janus a single Redis, or a primary with replicas.

### `UNSUPPORTED`: `collectExpired: store.sessions does not implement deleteExpiredSessions …`

**When:** `auth.collectExpired()`.

**Why:** Redis expires every session key itself, at its `expiresAt`. There is
nothing to collect, so the method is deliberately not implemented.

**Fix:** remove the scheduled job.

### `TypeError: connectRedis: this URI is already connected with other options.`

**When:** your application and Janus connect to the same Redis URI, one with
`enableOfflineQueue: false` and one without.

**Why:** `@nxgt/redis` shares one client per URI, and one client has one set of
options.

**Fix:** pass the same options everywhere, or give Janus its own URI — another
database number is enough: `redis://localhost:6379/1`.

### Users are signed out after Redis restarts

**When:** every session is gone after a restart or a failover, and pending
password reset links answer `TOKEN_UNKNOWN`.

**Why:** Redis kept them in memory only. Sessions are derived state: losing
them signs users out, which recovers.

**Fix:** if it matters, enable persistence (RDB snapshots, or AOF with
`appendfsync everysec`) on this Redis.

### Users are signed out while Redis is up, under memory pressure

**When:** sessions disappear before their expiry, or "sign out everywhere"
misses some, and Redis's `evicted_keys` (in `INFO stats`) grows.

**Why:** Redis evicts keys when it reaches `maxmemory`. Every key this adapter
writes has an expiry, so `volatile-*` policies evict them as readily as
`allkeys-*`.

**Fix:** set `maxmemory-policy noeviction` on this Redis, or give Janus a Redis
of its own. With `noeviction`, a full Redis refuses writes with `OOM`, which
answers 503 rather than signing anyone out.
