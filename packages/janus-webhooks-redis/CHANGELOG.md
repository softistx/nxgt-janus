# @nxgt/janus-webhooks-redis

## 0.3.1

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0
  - @nxgt/janus-webhooks@0.5.1

## 0.3.0

### Minor Changes

- [#146](https://github.com/softistx/nxgt-janus/pull/146) [`3ea9abc`](https://github.com/softistx/nxgt-janus/commit/3ea9abc62c076415b7a63cc8517dbd34fb43938d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The recovery codes' events, from `@nxgt/janus` 0.10: `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed` are signed, posted and verified like the other six. An endpoint's `types` may name them, and the Redis queue stores and reads them back. The messages that list the event types — `webhooks: an endpoint's types are user event types — …` and `webhooks: the listener takes a user event — …` — now list eight.
  
  **Upgrade the receiver before the sender.** A receiver's `verifyWebhook` before 0.4.0 answers `null` for the two new types, so their deliveries fail until they are given up. Until every receiver is upgraded, give its endpoint the `types` it knows. **Upgrade `@nxgt/janus-webhooks-redis` with `@nxgt/janus`, too**: a queue before 0.3.0 cannot read back a delivery of a new type.

### Patch Changes

- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`3ea9abc`](https://github.com/softistx/nxgt-janus/commit/3ea9abc62c076415b7a63cc8517dbd34fb43938d), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0
  - @nxgt/janus-webhooks@0.5.0

## 0.2.2

### Patch Changes

- Updated dependencies [[`e9337fa`](https://github.com/softistx/nxgt-janus/commit/e9337fa18849f38808dccc335e5e357a5be213b4)]:
  - @nxgt/janus-webhooks@0.4.0

## 0.2.1

### Patch Changes

- [#131](https://github.com/softistx/nxgt-janus/pull/131) [`ec98477`](https://github.com/softistx/nxgt-janus/commit/ec98477546ca7f65f394e9167df434b071104abf) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README no longer repeats the wiring guide: the Redis version it needs and what Redis holds are now one line each, with a link to the guide's table of what Redis must be configured with and its list of keys. Documentation only: no code changed.
- Updated dependencies [[`ec98477`](https://github.com/softistx/nxgt-janus/commit/ec98477546ca7f65f394e9167df434b071104abf)]:
  - @nxgt/janus-webhooks@0.3.1

## 0.2.0

### Minor Changes

- [#125](https://github.com/softistx/nxgt-janus/pull/125) [`bbe88a2`](https://github.com/softistx/nxgt-janus/commit/bbe88a2e4582ceeb0be6ea3b8bf3ae18e5ab0ee8) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `user.secondFactorEnabled` and `user.secondFactorDisabled`, the new user events of `@nxgt/janus`, are now delivered and verified like the other four:
  
  - `webhooks()` signs and posts them, and an endpoint's `types` may name them. An endpoint with no `types` receives them from now on.
  - `verifyWebhook` accepts them.
  - `createRedisWebhookQueue` writes them and reads them back.
  - The queue conformance suite round-trips all six types.
  
  A receiver on an earlier `@nxgt/janus-webhooks` answers `null` for these two types, so upgrade receivers first. Until you do, give their endpoints the four `types` they know.

### Patch Changes

- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129), [`bbe88a2`](https://github.com/softistx/nxgt-janus/commit/bbe88a2e4582ceeb0be6ea3b8bf3ae18e5ab0ee8)]:
  - @nxgt/janus@0.9.0
  - @nxgt/janus-webhooks@0.3.0

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
