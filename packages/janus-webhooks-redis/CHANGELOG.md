# @nxgt/janus-webhooks-redis

## 0.1.1

### Patch Changes

- [#86](https://github.com/softistx/nxgt-janus/pull/86) [`36d37dc`](https://github.com/softistx/nxgt-janus/commit/36d37dcd85e9ae4fca6f53b88fefecae7a2753f6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the README says each thing once. What Redis holds and how each script stays atomic move to the wiring guide, which now holds every detail; the README keeps a short summary and a link. The Redis 7.0 floor and the `zod` peer are stated once, in Install.

- [#90](https://github.com/softistx/nxgt-janus/pull/90) [`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the minimum server versions the READMEs promise are now tested on every CI run, and the docs say so. `@nxgt/janus-drizzle` passes both conformance suites on PostgreSQL 15 as well as 17, over each driver; `@nxgt/janus-redis` and `@nxgt/janus-webhooks-redis` pass theirs on Redis 7.0 and Valkey 7.2 as well as Redis 7.4. The adapters guide of `@nxgt/janus` lists the same versions.
- Updated dependencies [[`36d37dc`](https://github.com/softistx/nxgt-janus/commit/36d37dcd85e9ae4fca6f53b88fefecae7a2753f6), [`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e)]:
  - @nxgt/janus-webhooks@0.2.2
  - @nxgt/janus@0.8.6

## 0.1.0

### Minor Changes

- [#84](https://github.com/softistx/nxgt-janus/pull/84) [`1da1969`](https://github.com/softistx/nxgt-janus/commit/1da196993fa8a7885612726e22b441ceaa75c32f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `createRedisWebhookQueue(redis, { prefix? })`, a durable `WebhookQueue` for `@nxgt/janus-webhooks` on `@nxgt/redis`. Deliveries wait in Redis, shared by every process of the application, so a retry waiting when one process stops is sent by the next. Every method is one Lua script; a claim is atomic across processes and moves the lease in the same script; an insert is all or none. Only the event and the endpoint id are stored — never a URL or a secret. It passes the `@nxgt/janus-webhooks/conformance` suite against Redis 7.4, outages included. Needs Redis 7 or later (or Valkey), `maxmemory-policy noeviction`, persistence, and no Cluster.

### Patch Changes

- Updated dependencies [[`1da1969`](https://github.com/softistx/nxgt-janus/commit/1da196993fa8a7885612726e22b441ceaa75c32f)]:
  - @nxgt/janus-webhooks@0.2.1
