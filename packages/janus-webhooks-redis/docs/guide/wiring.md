# Wiring the queue to Redis

This page covers:
- passing the Redis queue to `webhooks()`, in every process;
- the prefix, and the connection options that matter;
- what Redis must be configured with;
- what Redis holds, and how each method stays atomic;
- what a failure looks like.

How a queue is used — inserts, claims, leases, orphans — is
`@nxgt/janus-webhooks`'s, in its
[queues guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-webhooks/docs/guide/queues.md).

## In every process

`createRedisWebhookQueue(redis)` answers a `WebhookQueue`. Pass it to
`webhooks({ queue })` in **every process** of the application, over the same
Redis and with the same prefix: they then share the deliveries, and what one
leaves waiting — a retry, a request a crash cut short — another sends.

```ts
import { webhooks } from '@nxgt/janus-webhooks';
import { createRedisWebhookQueue } from '@nxgt/janus-webhooks-redis';
import { connectRedis } from '@nxgt/redis';

const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	enableOfflineQueue: false,
});
const crmSecret = process.env.CRM_WEBHOOK_SECRET;
const searchSecret = process.env.SEARCH_WEBHOOK_SECRET;
if (!crmSecret || !searchSecret) throw new Error('a webhook secret is not set');

export const listener = webhooks({
	endpoints: [
		{ id: 'crm', url: 'https://crm.example.com/hooks/janus', secrets: [crmSecret] },
		{ id: 'search', url: 'https://search.example.com/hooks', secrets: [searchSecret], types: ['user.deleted'] },
	],
	queue: createRedisWebhookQueue(redis),
});
```

**Give each endpoint an `id`** from the start. The queue holds a delivery
under its endpoint's id, never its URL; without an `id`, the id is a hash of
the URL, and changing the URL leaves the deliveries waiting to an endpoint no
process knows — given up as `endpointRemoved` after `orphanGrace`.

## `createRedisWebhookQueue(redis, options?)`

```ts
function createRedisWebhookQueue(
	redis: RedisConnection, // what connectRedis returns
	options?: { prefix?: string }, // 'janus:webhooks:' by default
): WebhookQueue;
```

It connects to nothing and creates nothing: the keys are made by the first
insert, and Redis needs no schema. `redis` is `@nxgt/redis`'s connection,
whose client is Bun's `RedisClient`, so this runs on Bun.

`prefix` starts every key. Every process of one application passes the same;
two applications sharing one Redis each take their own, as do the tests of
one application:

```ts
createRedisWebhookQueue(redis, { prefix: 'clinic:webhooks:' });
```

It may share a Redis, and a connection, with `@nxgt/janus-redis`: that one's
keys start with `janus:` and hold sessions and tokens; a session key never
starts with `janus:webhooks:`.

## The connection's options

`connectRedis(uri, options)` takes Bun's `RedisOptions`. One of them decides
how an outage looks to your users — because the listener **awaits the
insert**, so every flow that sends an event waits for Redis:

| `enableOfflineQueue` | While Redis is unreachable | What the flow sees |
| --- | --- | --- |
| `true`, Bun's default | Every command waits while the client reconnects, then fails | `signUp` waits about **31 s**, then succeeds; the event is reported as `JANUS_EVENT_FAILED` |
| `false` | Every command fails at once | `signUp` succeeds at once; the event is reported as `JANUS_EVENT_FAILED` |

Either way the flow is not failed: `janus` reports a listener that rejects
and answers. The claims fail too, and `@nxgt/janus-webhooks` warns once per
outage with `JANUS_WEBHOOK_QUEUE_FAILED`; what waits in Redis is sent when it
answers again.

`connectRedis` shares one client per URI, and refuses a second connection to
the same URI with other options. If your application already connects to this
Redis, pass the same options everywhere, or give the queue a URI of its own,
for example another database number: `redis://localhost:6379/2`.

## What Redis must be configured with

| Setting | Why |
| --- | --- |
| `maxmemory-policy noeviction` | An evicted key is a delivery lost without a report. With `noeviction`, a full Redis refuses the insert with `OOM`, which is reported |
| AOF (`appendonly yes`, `appendfsync everysec`) or RDB snapshots | Without persistence, a restart of Redis loses every delivery waiting in it. With AOF `everysec`, a crash loses at most a second of inserts |
| A single Redis, or a primary with replicas — **not Cluster** | A script touches a delivery's key and its endpoint's, which may hash to different slots |
| Redis 7.0 or later, or Valkey | Tested on Redis 7.0, 7.4 and Valkey 7.2; the floor `@nxgt/janus-redis` needs, so one Redis serves both |

A Redis user restricted by ACL needs `+@scripting` and the commands the
scripts run — `HSET`, `HGET`, `HGETALL`, `HINCRBY`, `EXISTS`, `DEL`, `ZADD`,
`ZREM`, `ZRANGEBYSCORE`, `ZCARD`, `SADD`, `SREM`, `SISMEMBER`, `SMEMBERS` — on
the keys `~janus:webhooks:*`, or `~<your prefix>*`.

## What Redis holds, and for how long

| Key | Holds |
| --- | --- |
| `<prefix>delivery:<event id>:<type>:<endpoint id>` | the delivery, as a hash: the event's five fields, the endpoint id, `attempts`, the claim's `lease`, and the last failure's `status` and `error` |
| `<prefix>due:<endpoint id>` | the endpoint's deliveries, as a sorted set scored by when each is due, or when its lease ends while claimed |
| `<prefix>endpoints` | the endpoint ids with deliveries waiting, as a set: what the orphan claim walks |

**No URL and no secret is stored**: the queue holds the endpoint's id, and
the URL and secrets are read from the running configuration at each attempt.
No e-mail address either: `@nxgt/janus-webhooks` drops the `formerEmail` of a
`user.emailChanged` before it reaches the queue.
Dates are milliseconds since the epoch, passed in by `@nxgt/janus-webhooks` —
never Redis's clock.

Nothing expires by itself: a delivery stays until it is delivered or given
up, and its keys go with its last delete — an empty queue holds nothing.
What waits is bounded by what your endpoints refuse — at most eight attempts
over about 28 hours with the default schedule — and by `orphanGrace` for an
endpoint removed.

A claim reads each endpoint's sorted set from its earliest delivery, so it
costs the deliveries it claims, not the deliveries waiting.

## One Lua script per method

Redis runs nothing else while a script runs, so of twenty claims at once, no
two answer one delivery. Redis does not roll a script back when a command in
it fails half-way — a permission refused, a key of the wrong type — so **the
insert undoes its own writes** before it fails, and is all or none. The
others are not undone; what each leaves is in
[troubleshooting](../troubleshooting.md#store_failed-webhookqueuemethod-the-queue-could-not-answer).

The scripts are sent by SHA (`EVALSHA`), and in full only when Redis has
forgotten them after a restart, a failover or a `SCRIPT FLUSH`.

## What a failure looks like

The adapter defines **no error class**. A rejection is `@nxgt/janus`'s
`StoreFailure`, with `operation` the method that failed — or, for an
argument the queue could not read back, a `TypeError` before anything is
sent:

| What happens | What you get |
| --- | --- |
| Redis is unreachable, the connection closed, a timeout | `webhookQueue.<method>: the queue could not answer`; `cause` is Bun's `RedisError` |
| Redis refuses a command: `NOPERM`, `OOM`, `READONLY` on a replica, `WRONGTYPE` | the same; `cause` carries Redis's reply. An insert refused half-way is undone first; the other scripts are not — see [troubleshooting](../troubleshooting.md#store_failed-webhookqueuemethod-the-queue-could-not-answer) |
| A key under the prefix this adapter did not write | `webhookQueue.<method>: a reply that is not … — a key under the prefix this adapter did not write`, with no `cause`: never read as nothing due |
| An Invalid Date, a `limit` that is not a whole number 0 or more, a `failed.status` that is not `null` or a whole number | a `TypeError` — `webhookQueue.<method>: <name> is a valid Date`, `… limit is a whole number of deliveries, 0 or more`, `… failed.status is null or a whole number` — before any I/O; `webhooks()` never passes one |

Nothing answers `[]` or `false` for an error: a claim that answered "nothing
due" during an outage would hold every delivery back without a word.
`@nxgt/janus-webhooks` turns these into its warnings; the adapter writes
none of its own.
