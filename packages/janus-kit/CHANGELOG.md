# @nxgt/janus-kit

## 0.1.18

### Patch Changes

- Updated dependencies [[`3a4ecaa`](https://github.com/softistx/nxgt-janus/commit/3a4ecaada09a5063c9c803bab383f9c8d2fcb5e3)]:
  - @nxgt/janus@0.19.0
  - @nxgt/janus-drizzle@0.7.0
  - @nxgt/janus-mongo@0.8.0
  - @nxgt/janus-redis@0.4.7
  - @nxgt/janus-telemetry@0.9.1

## 0.1.17

### Patch Changes

- [#198](https://github.com/softistx/nxgt-janus/pull/198) [`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the configuration guide says a flushed Redis forgets `@nxgt/janus` 0.18's mail-throttle counts as well as the sign-in counts, and that on PostgreSQL their lapsed rows join the scheduled delete.
- Updated dependencies [[`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`9fd9e98`](https://github.com/softistx/nxgt-janus/commit/9fd9e987226994c551ae49b27277f52eba605f03)]:
  - @nxgt/janus-drizzle@0.6.3
  - @nxgt/janus@0.18.0
  - @nxgt/janus-telemetry@0.9.0
  - @nxgt/janus-redis@0.4.6
  - @nxgt/janus-mongo@0.7.3

## 0.1.16

### Patch Changes

- Updated dependencies [[`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070), [`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070)]:
  - @nxgt/janus@0.17.0
  - @nxgt/janus-telemetry@0.8.0
  - @nxgt/janus-drizzle@0.6.2
  - @nxgt/janus-mongo@0.7.2
  - @nxgt/janus-redis@0.4.5

## 0.1.15

### Patch Changes

- Updated dependencies [[`530e301`](https://github.com/softistx/nxgt-janus/commit/530e301eaf523af0b4f1d637e1990564bde70489), [`fba19d4`](https://github.com/softistx/nxgt-janus/commit/fba19d47836fb4dfbe11df7e5a184284082ac061), [`819c954`](https://github.com/softistx/nxgt-janus/commit/819c95494bdefe372284ef25a630c3f601d7765a)]:
  - @nxgt/janus@0.16.0
  - @nxgt/janus-drizzle@0.6.1
  - @nxgt/janus-mongo@0.7.1
  - @nxgt/janus-redis@0.4.4
  - @nxgt/janus-telemetry@0.7.1

## 0.1.14

### Patch Changes

- Updated dependencies [[`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906), [`c69356d`](https://github.com/softistx/nxgt-janus/commit/c69356da514446558f728ac45981aaecef88be1d), [`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906), [`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906), [`203190f`](https://github.com/softistx/nxgt-janus/commit/203190f032dbd2f451f28a244f85ff57f0502713)]:
  - @nxgt/janus-drizzle@0.6.0
  - @nxgt/janus@0.15.0
  - @nxgt/janus-mongo@0.7.0
  - @nxgt/janus-telemetry@0.7.0
  - @nxgt/janus-redis@0.4.3

## 0.1.13

### Patch Changes

- [#169](https://github.com/softistx/nxgt-janus/pull/169) [`d13602d`](https://github.com/softistx/nxgt-janus/commit/d13602dd581540d23cb265452f58c27a992585ff) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the configuration guide's `redis` section says a flushed Redis forgets `@nxgt/janus`'s sign-in counts, and that without Redis, on PostgreSQL, lapsed tokens need a scheduled delete beside `collectExpired()`.
- Updated dependencies [[`f171ae3`](https://github.com/softistx/nxgt-janus/commit/f171ae3abed8780e9cf61999daf48a3d2cd192ef), [`d13602d`](https://github.com/softistx/nxgt-janus/commit/d13602dd581540d23cb265452f58c27a992585ff), [`9931281`](https://github.com/softistx/nxgt-janus/commit/99312817e41913d8b29ed6d1636fad57d3d6da79), [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10)]:
  - @nxgt/janus@0.14.0
  - @nxgt/janus-drizzle@0.5.2
  - @nxgt/janus-redis@0.4.2
  - @nxgt/janus-telemetry@0.6.0
  - @nxgt/janus-mongo@0.6.2

## 0.1.12

### Patch Changes

- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0
  - @nxgt/janus-drizzle@0.5.1
  - @nxgt/janus-mongo@0.6.1
  - @nxgt/janus-redis@0.4.1
  - @nxgt/janus-telemetry@0.5.1

## 0.1.11

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199), [`628385f`](https://github.com/softistx/nxgt-janus/commit/628385f476826095b9fc7fb8483f466c99b22fdc)]:
  - @nxgt/janus@0.12.0
  - @nxgt/janus-drizzle@0.5.0
  - @nxgt/janus-mongo@0.6.0
  - @nxgt/janus-redis@0.4.0
  - @nxgt/janus-telemetry@0.5.0

## 0.1.10

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0
  - @nxgt/janus-drizzle@0.4.1
  - @nxgt/janus-mongo@0.5.1
  - @nxgt/janus-redis@0.3.5
  - @nxgt/janus-telemetry@0.4.1

## 0.1.9

### Patch Changes

- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`236d954`](https://github.com/softistx/nxgt-janus/commit/236d95484348f2a37921cf533e3dd8e6c42dda44), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`d759f80`](https://github.com/softistx/nxgt-janus/commit/d759f802a0288ff66b53b62617b3f3233f509e8c), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`a5bc514`](https://github.com/softistx/nxgt-janus/commit/a5bc5147313fa73cbd3f848d2636438bc844896d), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0
  - @nxgt/janus-drizzle@0.4.0
  - @nxgt/janus-mongo@0.5.0
  - @nxgt/janus-telemetry@0.4.0
  - @nxgt/janus-redis@0.3.4

## 0.1.8

### Patch Changes

- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129)]:
  - @nxgt/janus@0.9.0
  - @nxgt/janus-drizzle@0.3.3
  - @nxgt/janus-mongo@0.4.4
  - @nxgt/janus-redis@0.3.3
  - @nxgt/janus-telemetry@0.3.5

## 0.1.7

### Patch Changes

- [#92](https://github.com/softistx/nxgt-janus/pull/92) [`a72fbc3`](https://github.com/softistx/nxgt-janus/commit/a72fbc30ae56ea0b178b22a62572bb9fbc2bdcb9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README states each peer range exactly as the manifest declares it: `@nxgt/mongo` `>=0.17.0 <1` in `@nxgt/janus-mongo`, and in `@nxgt/janus-kit` the `@nxgt/telemetry` `>=0.2.1 <1` that `telemetry: true` needs through `@nxgt/janus-telemetry`.
- Updated dependencies [[`a72fbc3`](https://github.com/softistx/nxgt-janus/commit/a72fbc30ae56ea0b178b22a62572bb9fbc2bdcb9), [`a0efa15`](https://github.com/softistx/nxgt-janus/commit/a0efa15954c723fe11678db2cb1e6f1f8cf470b0)]:
  - @nxgt/janus-mongo@0.4.3
  - @nxgt/janus-telemetry@0.3.4

## 0.1.6

### Patch Changes

- Updated dependencies [[`206c2f0`](https://github.com/softistx/nxgt-janus/commit/206c2f0a2c496b964199a9f3cce5fb9d379cb1a2)]:
  - @nxgt/janus@0.8.0
  - @nxgt/janus-drizzle@0.3.1
  - @nxgt/janus-mongo@0.4.1
  - @nxgt/janus-redis@0.3.1
  - @nxgt/janus-telemetry@0.3.2

## 0.1.5

### Patch Changes

- Updated dependencies [[`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f)]:
  - @nxgt/janus@0.7.0
  - @nxgt/janus-drizzle@0.3.0
  - @nxgt/janus-mongo@0.4.0
  - @nxgt/janus-redis@0.3.0
  - @nxgt/janus-telemetry@0.3.1

## 0.1.4

### Patch Changes

- Updated dependencies [[`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579)]:
  - @nxgt/janus@0.6.0
  - @nxgt/janus-telemetry@0.3.0
  - @nxgt/janus-drizzle@0.2.2
  - @nxgt/janus-mongo@0.3.2
  - @nxgt/janus-redis@0.2.2

## 0.1.3

### Patch Changes

- Updated dependencies [[`6ecc391`](https://github.com/softistx/nxgt-janus/commit/6ecc391abfddef55fd4426fd96ecabeb3295308d), [`daa00a1`](https://github.com/softistx/nxgt-janus/commit/daa00a196bd1935d8d53cdb6481367e41e65ee4d)]:
  - @nxgt/janus-drizzle@0.2.1
  - @nxgt/janus-mongo@0.3.1
  - @nxgt/janus@0.5.0
  - @nxgt/janus-telemetry@0.2.0
  - @nxgt/janus-redis@0.2.1

## 0.1.2

### Patch Changes

- Updated dependencies [[`23c5801`](https://github.com/softistx/nxgt-janus/commit/23c5801d801bb927b137da7f88d6abfee853900d)]:
  - @nxgt/janus@0.4.0
  - @nxgt/janus-drizzle@0.2.0
  - @nxgt/janus-mongo@0.3.0
  - @nxgt/janus-redis@0.2.0
  - @nxgt/janus-telemetry@0.1.2

## 0.1.1

### Patch Changes

- Updated dependencies [[`93c1530`](https://github.com/softistx/nxgt-janus/commit/93c1530a5a1ae406dbc345e1c20a81da4f074272), [`9c64782`](https://github.com/softistx/nxgt-janus/commit/9c64782611e21e6e62d5cd332b48f982f2cbbc63)]:
  - @nxgt/janus-telemetry@0.1.1
  - @nxgt/janus@0.3.0
  - @nxgt/janus-drizzle@0.1.1
  - @nxgt/janus-mongo@0.2.1
  - @nxgt/janus-redis@0.1.1

## 0.1.0

### Minor Changes

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`f64375d`](https://github.com/softistx/nxgt-janus/commit/f64375d80d38123d1db931273b5b831a9d4b2fdd) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` wired for production in one call — PostgreSQL through `@nxgt/janus-drizzle` at `@nxgt/janus-kit/drizzle`, or MongoDB through `@nxgt/janus-mongo` at `@nxgt/janus-kit/mongo`, with sessions and one-time tokens in Redis through `@nxgt/janus-redis`, telemetry through `@nxgt/janus-telemetry`, a health check and a close.

### Patch Changes

- Updated dependencies [[`8534e83`](https://github.com/softistx/nxgt-janus/commit/8534e83e969963fd4a4defc36e0b73a82c88959a), [`6ae6f84`](https://github.com/softistx/nxgt-janus/commit/6ae6f847317f91d836f50666fe6edc5c9d9b6a17), [`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904), [`ebe6b61`](https://github.com/softistx/nxgt-janus/commit/ebe6b6102bde1d78e52991ba9a41f019ac92452e)]:
  - @nxgt/janus-drizzle@0.1.0
  - @nxgt/janus-redis@0.1.0
  - @nxgt/janus@0.2.2
  - @nxgt/janus-telemetry@0.1.0
