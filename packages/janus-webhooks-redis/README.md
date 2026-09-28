# @nxgt/janus-webhooks-redis

The Redis queue for [`@nxgt/janus-webhooks`](https://www.npmjs.com/package/@nxgt/janus-webhooks):
**deliveries wait in Redis**, on
[`@nxgt/redis`](https://www.npmjs.com/package/@nxgt/redis)'s connection,
shared by every process of your application. A retry waiting when a process
crashes, restarts or is redeployed is sent by the next one, and a request cut
short is sent again once its lease lapses.

It implements the `WebhookQueue` port, and passes the
`@nxgt/janus-webhooks/conformance` suite against a real Redis, outages
included, on every CI run.

> **0.x.** A minor version may still change the surface; the changelog says how.

## Install

```sh
bun add @nxgt/janus-webhooks-redis @nxgt/janus-webhooks @nxgt/janus @nxgt/redis
bun add zod                  # @nxgt/redis's peer, zod 4, if your application has none
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

It needs **Redis 7.0 or later**, or Valkey — see
[what Redis must be configured with](docs/guide/wiring.md#what-redis-must-be-configured-with).
Like `@nxgt/janus`, it expects `"moduleResolution": "bundler"`.

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

Each delivery's event and endpoint id — **never a URL or a secret** — with
[one Lua script per method](docs/guide/wiring.md#one-lua-script-per-method),
so no two claims answer one delivery.
[Wiring](docs/guide/wiring.md#what-redis-holds-and-for-how-long) has each key
and how long it stays.

## Traps

- **Hold the new event types back until every process sharing a queue is
  upgraded.** A delivery of `user.secondFactorEnabled` or
  `user.secondFactorDisabled`, written by 0.2.0, is `STORE_FAILED` (`a reply
  that is not … a user event type`) in a 0.1.x process that claims it — and
  so is one of `user.recoveryCodesRegenerated` or `user.recoveryCodeUsed`,
  written by 0.3.0, in a 0.2.x process — and that endpoint's claims fail
  there until every process is upgraded. Upgrade
  `@nxgt/janus`, `@nxgt/janus-webhooks` and `@nxgt/janus-webhooks-redis`
  together — their peer ranges move as one — with each endpoint limited to
  the `types` the older processes know, and drop the limit once every
  process runs the new versions:

  ```ts
  webhooks({
  	queue,
  	endpoints: [{ id: 'crm', url, secrets: [secret], types: ['user.created', 'user.emailVerified', 'user.passwordReset', 'user.deleted'] }],
  });
  ```

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
- **One prefix per application.** Two applications sharing a prefix share
  deliveries, and each gives up the other's endpoints as `endpointRemoved`
  after `orphanGrace`.

## Documentation

- [Guides](docs/README.md): wiring the queue, the prefix, what Redis must be configured with, what Redis holds and how each method stays atomic
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
