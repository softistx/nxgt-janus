# @nxgt/janus-mongo

## 0.1.2

### Patch Changes

- [#34](https://github.com/softistx/nxgt-janus/pull/34) [`110e70c`](https://github.com/softistx/nxgt-janus/commit/110e70cfa29020429cd8a59ec51d152ff742e692) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `createMongoAdapter(db)` answers `{ store, relations }`, the keys `janus()` takes them under: `janus({ …, ...createMongoAdapter(db) })` wires the identity stores and the relation store in one spread, so deleting a user deletes their tuples without a second wiring. `syncMongoAdapter(db)` syncs the four collections in one deployment step. `createMongoStores` and `createMongoRelations` stay, for one side alone.
- Updated dependencies [[`fe5bbfd`](https://github.com/softistx/nxgt-janus/commit/fe5bbfd26bad216941d8743541f579ea485d81b1), [`cfe8524`](https://github.com/softistx/nxgt-janus/commit/cfe8524656fecbc21ec52f7f3a2703ed17f92bbb), [`4d9ed5f`](https://github.com/softistx/nxgt-janus/commit/4d9ed5f2045efa4f6b0bd2ef09082f3f885eace1)]:
  - @nxgt/janus@0.1.3

## 0.1.1

### Patch Changes

- [#24](https://github.com/softistx/nxgt-janus/pull/24) [`2f6f326`](https://github.com/softistx/nxgt-janus/commit/2f6f326c458665418e8ed4597c33eab5192be7e6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README says each side is usable alone: `createMongoStores` for identities,
  `createMongoRelations` for permissions, or both.
- Updated dependencies [[`2f6f326`](https://github.com/softistx/nxgt-janus/commit/2f6f326c458665418e8ed4597c33eab5192be7e6)]:
  - @nxgt/janus@0.1.1

## 0.1.0

### Minor Changes

- [#22](https://github.com/softistx/nxgt-janus/pull/22) [`e14809e`](https://github.com/softistx/nxgt-janus/commit/e14809e2737934c73a21b2dd33dd667bc73df564) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first public release.

### Patch Changes

- Updated dependencies [[`e14809e`](https://github.com/softistx/nxgt-janus/commit/e14809e2737934c73a21b2dd33dd667bc73df564)]:
  - @nxgt/janus@0.1.0
