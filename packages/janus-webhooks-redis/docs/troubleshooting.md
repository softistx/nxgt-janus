# Troubleshooting `@nxgt/janus-webhooks-redis`

Each entry is headed by the text you see: a compiler error, a message, or an
error `code`. Search this page for the words of your message.

This adapter **defines no error class**, and writes no warning. Every error
it throws is `@nxgt/janus`'s `StoreFailure`, with `operation` the queue
method, and what Bun's Redis client threw as its `cause`.
`@nxgt/janus-webhooks` turns them into its own warnings —
`JANUS_WEBHOOK_QUEUE_FAILED`, and `JANUS_EVENT_FAILED` for an insert — which
are in
[its troubleshooting](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-webhooks/docs/troubleshooting.md).

## Index

**Types**
- [`TS2345: Argument of type '…' is not assignable to parameter of type 'RedisConnection'.`](#ts2345-argument-of-type--is-not-assignable-to-parameter-of-type-redisconnection)
- [`TS2322: Type 'number' is not assignable to type 'string'.`](#ts2322-type-number-is-not-assignable-to-type-string)

**Runtime**
- [`STORE_FAILED` after about 31 seconds, caused by `Max reconnection attempts reached`](#store_failed-after-about-31-seconds-caused-by-max-reconnection-attempts-reached)
- [`STORE_FAILED`: `webhookQueue.<method>: the queue could not answer`](#store_failed-webhookqueuemethod-the-queue-could-not-answer)
- [`STORE_FAILED`: `webhookQueue.<method>: a reply that is not … — a key under the prefix this adapter did not write`](#store_failed-webhookqueuemethod-a-reply-that-is-not---a-key-under-the-prefix-this-adapter-did-not-write)
- [`CROSSSLOT Keys in request don't hash to the same slot`, or `Script attempted to access a non local key in a cluster node`](#crossslot-keys-in-request-dont-hash-to-the-same-slot-or-script-attempted-to-access-a-non-local-key-in-a-cluster-node)
- [`TypeError: connectRedis: this URI is already connected with other options.`](#typeerror-connectredis-this-uri-is-already-connected-with-other-options)
- [Deliveries are lost when Redis restarts](#deliveries-are-lost-when-redis-restarts)
- [Deliveries disappear while Redis is up, under memory pressure](#deliveries-disappear-while-redis-is-up-under-memory-pressure)
- [Another application's endpoints are given up as `endpointRemoved`](#another-applications-endpoints-are-given-up-as-endpointremoved)

---

## Types

### `TS2345: Argument of type '…' is not assignable to parameter of type 'RedisConnection'.`

`'…'` is `'string'` for a URL, `'RedisClient'` for Bun's client, or
`'Promise<RedisConnection>'` for `connectRedis(…)` not awaited.

**When:** you pass `createRedisWebhookQueue` a URL, a `RedisClient` you
created yourself, or the promise `connectRedis` answers.

**Why:** the adapter takes the connection `@nxgt/redis`'s `connectRedis`
resolves to, and connects to nothing itself.

**Fix:**

```ts
import { connectRedis } from '@nxgt/redis';

const queue = createRedisWebhookQueue(await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379'));
```

### `TS2322: Type 'number' is not assignable to type 'string'.`

**When:** `createRedisWebhookQueue(redis, { prefix: 1 })`, or a prefix read
from somewhere typed otherwise.

**Why:** the prefix starts every key's name.

**Fix:** a string, ending with a separator:

```ts
createRedisWebhookQueue(redis, { prefix: 'clinic:webhooks:' });
```

---

## Runtime

### `STORE_FAILED` after about 31 seconds, caused by `Max reconnection attempts reached`

**When:** Redis is unreachable, and every flow that sends a user event —
`signUp`, `verifyEmail.confirm`, `delete` — hangs for about half a minute.

**Why:** the listener awaits the insert, and Bun's client queues commands
while it reconnects, failing them only once it gives up, after about 31 s
measured with `@nxgt/janus-redis`.

**Fix:** turn the queue off for this connection, so an outage fails the
insert at once; the flow then answers, and `janus` reports the event as
`JANUS_EVENT_FAILED`:

```ts
const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	enableOfflineQueue: false,
});
```

### `STORE_FAILED`: `webhookQueue.<method>: the queue could not answer`

`<method>` is one of `insertDeliveries`, `claimDeliveries`,
`claimOrphanedDeliveries`, `extendLease`, `scheduleRetry`, `deleteDelivery`.

**When:** any call, for as long as Redis cannot answer: unreachable, out of
memory (`OOM`), a replica that refuses writes (`READONLY`), a user without the
right (`NOPERM`), a key under the prefix of another type (`WRONGTYPE`). With
`enableOfflineQueue: false`, an outage's `cause` reads `Connection is closed
and offline queue is disabled`. An insert refused half-way has undone its
own writes before it fails: nothing of it is left.

**Why:** the adapter never turns a failure into an absence. An outage is not
"nothing due", which would hold every delivery back without a word.

**Fix:** nothing to do in code: `@nxgt/janus-webhooks` warns once per outage
with `JANUS_WEBHOOK_QUEUE_FAILED`, backs off, and sends what waits once Redis
answers again. Log `cause` for Redis's reply:

```ts
import { StoreFailure } from '@nxgt/janus';

if (error instanceof StoreFailure) console.error(error.operation, error.cause);
```

A Redis user restricted by ACL needs `+@scripting` and the commands the
scripts run (`HSET`, `HGET`, `HGETALL`, `HINCRBY`, `EXISTS`, `DEL`, `ZADD`,
`ZREM`, `ZRANGEBYSCORE`, `ZCARD`, `SADD`, `SREM`, `SISMEMBER`, `SMEMBERS`), on
the keys `~janus:webhooks:*`, or `~<your prefix>*`.

### `STORE_FAILED`: `webhookQueue.<method>: a reply that is not … — a key under the prefix this adapter did not write`

`…` names what was expected: `a list`, `a delivery`, `a delivery claimed`,
`a hash with \`<field>\``, `a date in \`occurredAt\``, `a count in
\`attempts\``, `a status in \`status\``, `a user event type`, `0 or 1`, `a
count`.

**When:** Redis answered, but a key under the prefix holds something this
adapter did not write: a key set by hand, another application using the same
prefix, or a key written by another version.

**Why:** a delivery it cannot read is a failure, never an absence — skipping
it would hold it back for ever, and answering it would send an event that
never happened. There is no `cause`: Redis did not fail.

**Fix:** give the queue a prefix no other code writes under, and delete the
foreign keys:

```ts
createRedisWebhookQueue(redis, { prefix: 'clinic:webhooks:' });
```

### `CROSSSLOT Keys in request don't hash to the same slot`, or `Script attempted to access a non local key in a cluster node`

The message is the `cause` of a `STORE_FAILED`.

**When:** the queue's Redis is a Redis Cluster.

**Why:** a script touches a delivery's key, its endpoint's sorted set and the
set of endpoints, which live in different hash slots. Cluster is not
supported.

**Fix:** give the queue a single Redis, or a primary with replicas.

### `TypeError: connectRedis: this URI is already connected with other options.`

**When:** your application and the queue connect to the same Redis URI, one
with `enableOfflineQueue: false` and one without.

**Why:** `@nxgt/redis` shares one client per URI, and one client has one set
of options.

**Fix:** pass the same options everywhere, or give the queue its own URI —
another database number is enough: `redis://localhost:6379/2`.

### Deliveries are lost when Redis restarts

**When:** after a restart or a failover of Redis, endpoints never receive
some events, and neither `onGivingUp` nor `JANUS_WEBHOOK_GAVE_UP` says so.

**Why:** Redis kept them in memory only. The queue is durable only as far as
Redis is.

**Fix:** enable persistence on this Redis — AOF with `appendfsync everysec`,
which loses at most a second of inserts on a crash, or RDB snapshots, which
lose what came since the last one.

### Deliveries disappear while Redis is up, under memory pressure

**When:** endpoints never receive some events, nothing reports them, and
Redis's `evicted_keys` (in `INFO stats`) grows.

**Why:** Redis evicts keys when it reaches `maxmemory`, under any policy but
`noeviction`. An evicted delivery hash is a delivery gone.

**Fix:** set `maxmemory-policy noeviction` on this Redis, or give the queue a
Redis of its own. With `noeviction`, a full Redis refuses the insert with
`OOM`: the event is reported as `JANUS_EVENT_FAILED` instead of lost in
silence.

### Another application's endpoints are given up as `endpointRemoved`

**When:** `onGivingUp` receives deliveries with `reason.why`
`'endpointRemoved'` and `delivery.url` `null`, for endpoint ids this
application never had.

**Why:** two applications share one Redis and one prefix, so they share one
queue. Each claims the other's deliveries as orphans — endpoints it is not
configured with — and gives them up after `orphanGrace`.

**Fix:** a prefix per application:

```ts
createRedisWebhookQueue(redis, { prefix: 'billing:webhooks:' });
```
