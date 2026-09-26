# @nxgt/janus-mongo

## 0.2.1

### Patch Changes

- Updated dependencies [[`9c64782`](https://github.com/softistx/nxgt-janus/commit/9c64782611e21e6e62d5cd332b48f982f2cbbc63)]:
  - @nxgt/janus@0.3.0

## 0.2.0

### Minor Changes

- [#49](https://github.com/softistx/nxgt-janus/pull/49) [`579ff03`](https://github.com/softistx/nxgt-janus/commit/579ff03d84809d7f1e1bf8f4c32ce5fe76b0aa9a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The examples and guides write the permission model with `related` and `permits`, the keys of `@nxgt/janus` 0.2. They require `@nxgt/janus` 0.2: a minor release, since on 0.x a patch would drop 0.1 without saying so.

### Patch Changes

- [#45](https://github.com/softistx/nxgt-janus/pull/45) [`67106ed`](https://github.com/softistx/nxgt-janus/commit/67106ed205eaa8725e18b08f928288ff03d867a0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `LOGIN_TAKEN`: the message no longer quotes the login — `insertUser: the login is taken by another patient` — as a message never carries a value, and an e-mail in a log line is personal data. `error.login` and `error.userType` still name it.
  
  **For adapter authors:** `@nxgt/janus/conformance` now checks that a login conflict's message does not quote the login. An adapter that copied the old wording fails `users` until its message drops the value.
- Updated dependencies [[`db8bcaf`](https://github.com/softistx/nxgt-janus/commit/db8bcafb4284fda9a6609207658e17f80c16a5aa), [`67106ed`](https://github.com/softistx/nxgt-janus/commit/67106ed205eaa8725e18b08f928288ff03d867a0), [`579ff03`](https://github.com/softistx/nxgt-janus/commit/579ff03d84809d7f1e1bf8f4c32ce5fe76b0aa9a), [`506075f`](https://github.com/softistx/nxgt-janus/commit/506075ff9eb11f7bb49bcde5cfd5dfe2ddf11e5d)]:
  - @nxgt/janus@0.2.0

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
