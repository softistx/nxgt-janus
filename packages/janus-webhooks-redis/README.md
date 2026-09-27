# @nxgt/janus-webhooks-redis

The Redis queue for [`@nxgt/janus-webhooks`](https://www.npmjs.com/package/@nxgt/janus-webhooks):
**deliveries wait in Redis**, on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis)'s connection,
shared by every process of your application. A retry waiting when a process
crashes, restarts or is redeployed is sent by the next one, and a request cut
short is sent again once its lease lapses.

It implements the `WebhookQueue` port, and passes the
`@nxgt/janus-webhooks/conformance` suite against a real Redis 7.4, outages
included.

> **Not published yet.** This package is private while it is reviewed; the
> examples below are what it will be.

## Install

```sh
bun add @nxgt/janus-webhooks-redis @nxgt/janus-webhooks @nxgt/janus @nxgt/redis
bun add zod                  # @nxgt/redis's peer, if your application has none
bun add -d typescript        # 6
```

Every peer is required:
- `@nxgt/janus-webhooks`, whose port it implements;
- `@nxgt/janus`, whose `UserEvent` it holds and whose `StoreFailure` it
  throws — a **peer**, never a dependency, so `instanceof StoreFailure` holds
  in your code;
- `@nxgt/redis`, `>=0.3.1 <1`, whose connection wraps Bun's own `RedisClient`,
  so this runs on **Bun**;
- `typescript` 6.

It needs **Redis 7.0 or later**, or Valkey. Like `@nxgt/janus`, it expects
`"moduleResolution": "bundler"`. `@nxgt/redis` itself requires `zod` 4 as a
peer: `bun add zod` if your application does not already use it.

## Usage

```ts
import { webhooks } from '@nxgt/janus-webhooks';
import { createRedisWebhookQueue } from '@nxgt/janus-webhooks-redis';
import { connectRedis } from '@nxgt/redis';

const secret = process.env.CRM_WEBHOOK_SECRET; // whsec_…, from mintWebhookSecret()
if (!secret) throw new Error('CRM_WEBHOOK_SECRET is not set');

const redis = await connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
	enableOfflineQueue: false, // an outage fails the insert at once, not after 31 s
});

export const listener = webhooks({
	endpoints: [{ id: 'crm', url: 'https://crm.example.com/hooks/janus', secrets: [secret] }],
	queue: createRedisWebhookQueue(redis), // every process passes the same Redis and prefix
});

// janus({ …, events: listener })

process.on('SIGTERM', async () => {
	await listener.close(); // gives nothing up: what waits is sent by the next process
	process.exit(0);
});
```

Give each endpoint an `id` when you first pass a queue: it is what the queue
knows the endpoint by. [Wiring](docs/guide/wiring.md) covers the connection,
the prefix, and what Redis must be configured with.

## API

| Export | What it is |
| --- | --- |
| `createRedisWebhookQueue(redis, options?)` | Returns a `WebhookQueue`, for `webhooks({ queue })`. `redis` is what `connectRedis` returns. It connects to nothing and creates nothing: the keys are made by the first insert. |
| `RedisWebhookQueueOptions` | `{ prefix? }`: what every key starts with, `janus:webhooks:` by default. Every process sharing deliveries passes the same one. |

## What Redis holds

Each key starts with the prefix.

| Key | Holds |
| --- | --- |
| `delivery:<event id>:<type>:<endpoint id>` | the delivery, as a hash: the event's five fields, the endpoint id, `attempts`, the claim's `lease`, and the last failure's `status` and `error` |
| `due:<endpoint id>` | the endpoint's deliveries, as a sorted set scored by when each is due — or, while claimed, when its lease ends |
| `endpoints` | the endpoint ids with deliveries waiting, as a set: what the orphan claim walks |

No URL and no secret is stored: the queue holds the endpoint's id, and the
URL and secrets are read from the running configuration at each attempt.
Dates are milliseconds since the epoch, passed in by `@nxgt/janus-webhooks` —
never Redis's clock. A delivery's keys go with its last delete: an empty
queue holds nothing.

**Every method is one Lua script.** Redis runs nothing else while a script
runs, so of twenty claims at once, no two answer one delivery. An insert is
all or none: Redis does not roll a script back when a command in it fails, so
the insert undoes its own writes before it fails. The scripts are sent by SHA
(`EVALSHA`), and in full only when Redis has forgotten them after a restart,
a failover or a `SCRIPT FLUSH`.

## Traps

- **Eviction is data loss.** A Redis whose `maxmemory-policy` evicts keys
  drops deliveries without a word — no retry, no `onGivingUp`. Run this on a
  Redis with `noeviction`; a full one then refuses the insert with `OOM`,
  which `janus` reports as `JANUS_EVENT_FAILED`.
- **Persistence is what makes it durable.** Without RDB or AOF, restarting
  Redis loses every delivery waiting in it. Enable AOF (`appendfsync
  everysec` loses at most a second of inserts on a crash) or RDB snapshots.
- **Redis Cluster is not supported.** A script touches the keys of a
  delivery and of its endpoint, which may live in different slots. Use a
  single Redis, or a primary with replicas.
- **By default, an outage makes every flow wait 31 seconds.** The listener
  awaits the insert, and Bun's client queues commands while it reconnects.
  With `enableOfflineQueue: false` the insert fails at once, the flow goes
  on, and the event is reported as `JANUS_EVENT_FAILED`.
- **Redis 7.0 or later.** Tested on 7.4. The scripts use no command newer
  than Redis 4, but 7.0 is what `@nxgt/janus-redis` needs, and one Redis
  usually serves both.
- **One prefix per application.** Two applications sharing a prefix share
  deliveries, and each gives up the other's endpoints as `endpointRemoved`
  after `orphanGrace`.

## Documentation

- [Guides](docs/README.md): wiring the queue, the prefix, what Redis must be configured with
- [Troubleshooting](docs/troubleshooting.md): look up the error message you see
- [Roadmap](docs/roadmap.md): what is next, and what is not planned
- [`@nxgt/janus-webhooks`'s queues guide](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-webhooks/docs/guide/queues.md): claims, leases, orphans, and what a queue must do

## Type safety, counted

Four plausible mistakes are refused by the compiler, each with a
`@ts-expect-error` case in `test/types/queue.ts`:
- a URL instead of a connection;
- Bun's client instead of the connection that holds it;
- the promise `connectRedis` answers, not awaited;
- a `prefix` that is not a string.

## Licence

MIT
