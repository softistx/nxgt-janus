# @nxgt/janus-drizzle

## 0.2.2

### Patch Changes

- Updated dependencies [[`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579)]:
  - @nxgt/janus@0.6.0

## 0.2.1

### Patch Changes

- [#62](https://github.com/softistx/nxgt-janus/pull/62) [`6ecc391`](https://github.com/softistx/nxgt-janus/commit/6ecc391abfddef55fd4426fd96ecabeb3295308d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The second factor's secret is described as it now is: sealed by `@nxgt/janus` with AES-256-GCM before the store sees it. The docs add a query to find secrets still sealed with a key you are rotating out.
- Updated dependencies [[`daa00a1`](https://github.com/softistx/nxgt-janus/commit/daa00a196bd1935d8d53cdb6481367e41e65ee4d)]:
  - @nxgt/janus@0.5.0

## 0.2.0

### Minor Changes

- [#60](https://github.com/softistx/nxgt-janus/pull/60) [`23c5801`](https://github.com/softistx/nxgt-janus/commit/23c5801d801bb927b137da7f88d6abfee853900d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The store port gains what one-time codes need. No flow uses it yet: the second factor and e-mail sign-in codes come next.
  
  - `UserRecord.secondFactor` is a TOTP secret, which the core will seal once the second factor ships, with its confirmation and the last step accepted, or `null`. `UserPatch` names it like `password`.
  - `TokenRecord` gains `codeHash` and `attempts`, and `TokenKind` gains `'secondFactor'` and `'signInCode'`.
  - `TokenStore.countAttempt(tokenHash, kind)` is a new required method. It is one conditional write that counts an attempt at a code and answers the token after it. A spent token is answered as it is, and an unknown one is `null`.
  
  **For an adapter author:** implement `countAttempt`, store the new fields, and run the conformance suite. It has six new cases, including twenty concurrent attempts that must answer twenty distinct counts, and attempts racing a redemption that must never be counted once it spent the token.
  
  **`@nxgt/janus-drizzle`:** `users` gains four `second_factor_*` columns, and `tokens` gains `code_hash` and `attempts`. Run `drizzle-kit generate`, then migrate, before deploying.
  
  **`@nxgt/janus-mongo`:** rewrite no document, but **run `syncMongoAdapter(db)` or `syncMongoStores(db)` before deploying**. The validator the previous sync wrote refuses the new fields, so every sign-up and one-time token fails with `STORE_FAILED` (`Document failed validation`) until it runs. A document written before reads as no second factor, no code and no attempt.
  
  **`@nxgt/janus-redis`** needs no migration: a token written before reads as no code and no attempt.

### Patch Changes

- Updated dependencies [[`23c5801`](https://github.com/softistx/nxgt-janus/commit/23c5801d801bb927b137da7f88d6abfee853900d)]:
  - @nxgt/janus@0.4.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`9c64782`](https://github.com/softistx/nxgt-janus/commit/9c64782611e21e6e62d5cd332b48f982f2cbbc63)]:
  - @nxgt/janus@0.3.0

## 0.1.0

### Minor Changes

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`8534e83`](https://github.com/softistx/nxgt-janus/commit/8534e83e969963fd4a4defc36e0b73a82c88959a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: both sides of `@nxgt/janus` — users, sessions, one-time tokens and the relation store — over one PostgreSQL database, on Drizzle and `@nxgt/drizzle`. `defineJanusTables({ schema? })` gives the tables your drizzle-kit migrations create, in a database or a schema of their own. It passes both conformance suites on PostgreSQL 17 and PGlite.

### Patch Changes

- Updated dependencies [[`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904)]:
  - @nxgt/janus@0.2.2
