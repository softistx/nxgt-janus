# @nxgt/janus-webhooks-redis

## 0.6.4

### Patch Changes

- Updated dependencies [[`082162c`](https://github.com/softistx/nxgt-janus/commit/082162c2446a5930db18696b5c9e5183a3749846)]:
  - @nxgt/janus@0.33.0
  - @nxgt/janus-webhooks@0.8.4

## 0.6.3

### Patch Changes

- Updated dependencies [[`37f7928`](https://github.com/softistx/nxgt-janus/commit/37f79283a83abdd483e2e8b23e6211d1c3a17d6b)]:
  - @nxgt/janus@0.32.0
  - @nxgt/janus-webhooks@0.8.3

## 0.6.2

### Patch Changes

- Updated dependencies [[`4399268`](https://github.com/softistx/nxgt-janus/commit/43992681462f21aa54f26016e68dd955cbefe06e)]:
  - @nxgt/janus@0.31.0
  - @nxgt/janus-webhooks@0.8.2

## 0.6.1

### Patch Changes

- Updated dependencies [[`689e0ce`](https://github.com/softistx/nxgt-janus/commit/689e0ce3ab57d3dfc3a9e0f08dd6aad8ebdf44f6)]:
  - @nxgt/janus@0.30.0
  - @nxgt/janus-webhooks@0.8.1

## 0.6.0

### Minor Changes

- [#258](https://github.com/softistx/nxgt-janus/pull/258) [`a88acf0`](https://github.com/softistx/nxgt-janus/commit/a88acf0f4e364f413a2b3ad0ae1d11494ffb0241) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Write a user's avatar: `auth.<type>.avatar.set(user, { id }, { ifVersion? })` and `avatar.remove(user, { ifVersion? })` (on the root, `auth.avatar.set`, with several user types, finding the type from the user's record). Janus stores only the id your application chose; upload the image to your own storage first, under a fresh id such as `crypto.randomUUID()`, then call `set`. The user comes back with `user.avatar`.
  
  - `set` refuses an id that is not a non-empty string of at most 512 characters that every store can keep, with the new `AVATAR_ID_INVALID` (400, `AvatarIdInvalidError`), before reading anything. Setting the id the user already has, or removing an absent avatar, writes and sends nothing.
  - Two new user events, `user.avatarChanged` and `user.avatarRemoved`, carry `formerAvatarId`: the id of the image the write let go, which is how your listener deletes it from storage. `UserEventType` gains both, so a `switch` on `event.type` that was exhaustive needs two cases. `formerAvatarId` stays in the process that wrote the event, as `formerEmail` does.
  - `avatar` can no longer name a user type (a compile error, and a `TypeError` for a JavaScript caller).
  - These are server-side methods with no access or freshness check, like `update`: whether a request may change an avatar is the application's to decide.
  
  **`@nxgt/janus-webhooks`** and **`@nxgt/janus-webhooks-redis`** accept the two new event types (`webhooks({ endpoints })` posts them to endpoints whose `types` include them, all of them when `types` is absent, and a queue reads them back). **Upgrade every receiver's `@nxgt/janus-webhooks` before the sender**: an older `verifyWebhook` answers `null` for a type it does not know, and a 0.5.x queue process fails a claim of one with `STORE_FAILED`. Give an endpoint the `types` it knows until then.
  
  **`@nxgt/janus-telemetry`** writes `janus.avatar.set` and `janus.avatar.removed` with the `user.id` and `janus.user.type` (the root form's too), never the avatar id.
  
  **`@nxgt/janus-hono`** only recognises the new `AVATAR_ID_INVALID` code in its tests and docs: it answers 400 `{ code }`.

### Patch Changes

- Updated dependencies [[`a88acf0`](https://github.com/softistx/nxgt-janus/commit/a88acf0f4e364f413a2b3ad0ae1d11494ffb0241), [`a953d84`](https://github.com/softistx/nxgt-janus/commit/a953d845ff61140be80af7fd3eb805876f1e1b38)]:
  - @nxgt/janus@0.29.0
  - @nxgt/janus-webhooks@0.8.0

## 0.5.12

### Patch Changes

- Updated dependencies [[`ba8ac81`](https://github.com/softistx/nxgt-janus/commit/ba8ac81c6f8149b0063541172c994ed5e5990b91)]:
  - @nxgt/janus@0.28.0
  - @nxgt/janus-webhooks@0.7.12

## 0.5.11

### Patch Changes

- Updated dependencies [[`9783db4`](https://github.com/softistx/nxgt-janus/commit/9783db4f9f68585f45821ce7013aa65d4c4ab5dc)]:
  - @nxgt/janus@0.27.0
  - @nxgt/janus-webhooks@0.7.11

## 0.5.10

### Patch Changes

- Updated dependencies [[`1795b95`](https://github.com/softistx/nxgt-janus/commit/1795b952cc3070c72034ca8aedb7457c45888fde)]:
  - @nxgt/janus@0.26.0
  - @nxgt/janus-webhooks@0.7.10

## 0.5.9

### Patch Changes

- Updated dependencies [[`edabeb3`](https://github.com/softistx/nxgt-janus/commit/edabeb310e1e944c0f555979d5f119302f35618b)]:
  - @nxgt/janus@0.25.0
  - @nxgt/janus-webhooks@0.7.9

## 0.5.8

### Patch Changes

- Updated dependencies [[`7e3bfc8`](https://github.com/softistx/nxgt-janus/commit/7e3bfc837dc8586a41f7630dc98fd48ee199622f), [`04f378c`](https://github.com/softistx/nxgt-janus/commit/04f378c37a55d6b6c9609aab4394e749c6950be2), [`311c80d`](https://github.com/softistx/nxgt-janus/commit/311c80db5875e9e878dfff946b71deac6bf58b16)]:
  - @nxgt/janus@0.24.0
  - @nxgt/janus-webhooks@0.7.8

## 0.5.7

### Patch Changes

- Updated dependencies [[`349664c`](https://github.com/softistx/nxgt-janus/commit/349664c16b994a4957ad2e37580b67fd0f2cb22d), [`edbd4f3`](https://github.com/softistx/nxgt-janus/commit/edbd4f3b5a2faed9e2ee8a59ead8910b4b9031ff)]:
  - @nxgt/janus@0.23.0
  - @nxgt/janus-webhooks@0.7.7

## 0.5.6

### Patch Changes

- [#211](https://github.com/softistx/nxgt-janus/pull/211) [`01867bc`](https://github.com/softistx/nxgt-janus/commit/01867bc438ec82cdcf867ab755a2af72874346bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accept TypeScript 7 as well as 6: the `typescript` peer is `^6.0.3 || ^7.0.0`. The packages use TypeScript for its type-level API only, and the type tests, including every compile-time refusal, pass under 7.0.2.
- Updated dependencies [[`01867bc`](https://github.com/softistx/nxgt-janus/commit/01867bc438ec82cdcf867ab755a2af72874346bc)]:
  - @nxgt/janus-webhooks@0.7.6
  - @nxgt/janus@0.22.1

## 0.5.5

### Patch Changes

- Updated dependencies [[`8d9256d`](https://github.com/softistx/nxgt-janus/commit/8d9256dc52bf0c4dd5d489cad37c469cdd7ba812)]:
  - @nxgt/janus@0.22.0
  - @nxgt/janus-webhooks@0.7.5

## 0.5.4

### Patch Changes

- Updated dependencies [[`d450195`](https://github.com/softistx/nxgt-janus/commit/d450195141da06ffb138dd74159ee2865bdd7369)]:
  - @nxgt/janus@0.21.0
  - @nxgt/janus-webhooks@0.7.4

## 0.5.3

### Patch Changes

- Updated dependencies [[`e064597`](https://github.com/softistx/nxgt-janus/commit/e0645973a37b64ddd47aa4540fd195172888f9b6), [`9629708`](https://github.com/softistx/nxgt-janus/commit/962970815238b4e6684256c9e891b2e662d76b68)]:
  - @nxgt/janus@0.20.0
  - @nxgt/janus-webhooks@0.7.3

## 0.5.2

### Patch Changes

- Updated dependencies [[`3a4ecaa`](https://github.com/softistx/nxgt-janus/commit/3a4ecaada09a5063c9c803bab383f9c8d2fcb5e3)]:
  - @nxgt/janus@0.19.0
  - @nxgt/janus-webhooks@0.7.2

## 0.5.1

### Patch Changes

- Updated dependencies [[`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`9fd9e98`](https://github.com/softistx/nxgt-janus/commit/9fd9e987226994c551ae49b27277f52eba605f03)]:
  - @nxgt/janus@0.18.0
  - @nxgt/janus-webhooks@0.7.1

## 0.5.0

### Minor Changes

- [#181](https://github.com/softistx/nxgt-janus/pull/181) [`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Queues `user.newDeviceSignedIn`, `@nxgt/janus-webhooks` 0.7's new type.
  
  - **Breaking in a mixed fleet: a 0.4.x process refuses a `user.newDeviceSignedIn` delivery written by 0.5.0. Upgrade every process, receivers first**, or leave the type out of `webhooks({ types })` until they are.

### Patch Changes

- Updated dependencies [[`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070), [`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070)]:
  - @nxgt/janus@0.17.0
  - @nxgt/janus-webhooks@0.7.0

## 0.4.2

### Patch Changes

- Updated dependencies [[`530e301`](https://github.com/softistx/nxgt-janus/commit/530e301eaf523af0b4f1d637e1990564bde70489), [`fba19d4`](https://github.com/softistx/nxgt-janus/commit/fba19d47836fb4dfbe11df7e5a184284082ac061), [`819c954`](https://github.com/softistx/nxgt-janus/commit/819c95494bdefe372284ef25a630c3f601d7765a)]:
  - @nxgt/janus@0.16.0
  - @nxgt/janus-webhooks@0.6.2

## 0.4.1

### Patch Changes

- Updated dependencies [[`c69356d`](https://github.com/softistx/nxgt-janus/commit/c69356da514446558f728ac45981aaecef88be1d), [`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906)]:
  - @nxgt/janus@0.15.0
  - @nxgt/janus-webhooks@0.6.1

## 0.4.0

### Minor Changes

- [#167](https://github.com/softistx/nxgt-janus/pull/167) [`1c91d8f`](https://github.com/softistx/nxgt-janus/commit/1c91d8f69893bac631e3240ec0b28911c7771ced) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The change events, from `@nxgt/janus` 0.14: `user.passwordChanged` and `user.emailChanged` are signed, posted and verified like the other eight. An endpoint's `types` may name them, and the Redis queue stores and reads them back. The messages that list the event types — `webhooks: an endpoint's types are user event types — …` and `webhooks: the listener takes a user event — …` — now list ten.
  
  **`user.emailChanged` is posted without its `formerEmail`.** `webhooks()` drops the address `@nxgt/janus` hands its listener before the queue, so no endpoint, queue — yours or the Redis one — or `onGivingUp` report ever holds it. Send the notice to the former address from the `janus({ events })` listener, beside `webhooks()`.
  
  **Upgrade the receiver before the sender.** A receiver's `verifyWebhook` before 0.6.0 answers `null` for the two new types, so their deliveries fail until they are given up. Until every receiver is upgraded, give its endpoint the `types` it knows. **Upgrade `@nxgt/janus-webhooks-redis` with `@nxgt/janus`, too**: a queue before 0.4.0 cannot read back a delivery of a new type, and the claims of that endpoint fail in its processes until they are upgraded.

### Patch Changes

- Updated dependencies [[`1c91d8f`](https://github.com/softistx/nxgt-janus/commit/1c91d8f69893bac631e3240ec0b28911c7771ced), [`f171ae3`](https://github.com/softistx/nxgt-janus/commit/f171ae3abed8780e9cf61999daf48a3d2cd192ef), [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10)]:
  - @nxgt/janus-webhooks@0.6.0
  - @nxgt/janus@0.14.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0
  - @nxgt/janus-webhooks@0.5.3

## 0.3.2

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0
  - @nxgt/janus-webhooks@0.5.2

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
