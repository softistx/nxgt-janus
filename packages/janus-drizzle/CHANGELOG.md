# @nxgt/janus-drizzle

## 0.5.0

### Minor Changes

- [#157](https://github.com/softistx/nxgt-janus/pull/157) [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Implements `SessionStore.reauthenticateSession` — one `update … where revoked_at is null returning` — and admits the token kind `stepUp`.
  
  **A migration is required: the `tokens_kind` check admits `stepUp`.** Run `drizzle-kit generate`, then migrate. It writes one statement, `ALTER TABLE "tokens" DROP CONSTRAINT "tokens_kind", ADD CONSTRAINT "tokens_kind" CHECK (… 'stepUp')`, and rewrites no row. Deployed without it, a step-up request fails with `STORE_FAILED`, caused by `violates check constraint "tokens_kind"`; every other flow keeps working. `sessions` gains no column.

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0

## 0.4.0

### Minor Changes

- [#143](https://github.com/softistx/nxgt-janus/pull/143) [`236d954`](https://github.com/softistx/nxgt-janus/commit/236d95484348f2a37921cf533e3dd8e6c42dda44) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Recovery codes on a second factor, for `@nxgt/janus` 0.10. `users` gains `second_factor_recovery_codes`, a nullable `text[]` holding the codes' keyed hashes in order. No codes are written `null`, never `{}`, and `null` reads as `[]`, so a row written before the column existed reads as a factor with no codes. The `users_second_factor_whole` check now keeps the codes to a row with a second factor.
  
  **A migration is required.** Generate and apply it before deploying, as for 0.2:
  
  ```sh
  bunx drizzle-kit generate --config drizzle.janus.config.ts
  bunx drizzle-kit migrate --config drizzle.janus.config.ts
  ```
  
  drizzle-kit writes two statements — the column, and the check dropped and added again — and rewrites no row:
  
  ```sql
  ALTER TABLE "users" ADD COLUMN "second_factor_recovery_codes" text[];
  ALTER TABLE "users" DROP CONSTRAINT "users_second_factor_whole", ADD CONSTRAINT "users_second_factor_whole" CHECK (("second_factor_method" is null) = ("second_factor_secret" is null) and ("second_factor_method" is not null or ("second_factor_confirmed_at" is null and "second_factor_last_step" is null and "second_factor_recovery_codes" is null)));
  ```
  
  Deployed before it, every query on `users` fails with `STORE_FAILED`, caused by `column "second_factor_recovery_codes" does not exist`.
  
  **Finish the rollout before users hold codes.** An instance still on 0.3 knows four columns: once a user holds recovery codes, its `secondFactor.disable` leaves them beside a factor removed, the check refuses the write, and the call fails with `STORE_FAILED` (it succeeds on 0.4; nothing is lost). Run the two side by side only while no user has been given codes.

### Patch Changes

- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129)]:
  - @nxgt/janus@0.9.0

## 0.3.2

### Patch Changes

- [#90](https://github.com/softistx/nxgt-janus/pull/90) [`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the minimum server versions the READMEs promise are now tested on every CI run, and the docs say so. `@nxgt/janus-drizzle` passes both conformance suites on PostgreSQL 15 as well as 17, over each driver; `@nxgt/janus-redis` and `@nxgt/janus-webhooks-redis` pass theirs on Redis 7.0 and Valkey 7.2 as well as Redis 7.4. The adapters guide of `@nxgt/janus` lists the same versions.
- Updated dependencies [[`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e)]:
  - @nxgt/janus@0.8.6

## 0.3.1

### Patch Changes

- Updated dependencies [[`206c2f0`](https://github.com/softistx/nxgt-janus/commit/206c2f0a2c496b964199a9f3cce5fb9d379cb1a2)]:
  - @nxgt/janus@0.8.0

## 0.3.0

### Minor Changes

- [#66](https://github.com/softistx/nxgt-janus/pull/66) [`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - At most one sign-in code live per user, and challenges that end when they should.
  
  - **At most one sign-in code is live per user.** `signInCode.request` issues its code, then spends every other challenge of that user, so only the code in the last e-mail works and an earlier one answers `TOKEN_SPENT`. Requests that race cannot each keep a code: at most one survives. Rate-limit `request` per address, because every call sends an e-mail and cancels the code before it.
  - **Writing a password ends the sign-ins left waiting on a second factor.** `resetPassword.confirm`, `setPassword` and `changePassword` spend every open `secondFactor` challenge of the user, so whoever had the old password cannot finish a sign-in they started with it.
  - **A sign-in that is still running when the password is written is refused.** `signIn` reads the user again once it has answered. If the password it verified is no longer theirs, it revokes the session it opened, or spends its challenge, and throws `CREDENTIALS_INVALID`. A hash rewritten for the same password is not a change.
  - **Another user type's `confirm` spends a challenge at its fifth attempt**, as a fifth wrong code does. This applies to `secondFactor.confirm` and `signInCode.confirm`. Calls after that answer `TOKEN_SPENT`, where they used to answer `CODE_INVALID` with `attemptsLeft: 0`.
  - **`verifyEmail.confirm` and `resetPassword.confirm` check the e-mail again on the record they write.** An address changed while the link was being redeemed answers `TOKEN_STALE`, and nothing is written.
  - **`SecondFactorRequired` carries `userId`**, for your logs and rate limits. Answer the visitor the challenge alone.
  - **For adapter authors:** `TokenStore` gains `spendUserTokens(userId, kind, at, except?)`. It spends the unspent tokens of one user and one kind, except the one whose hash is `except`, and answers how many. It never spends a token that a racing `consumeToken` also spends. The conformance suite has four new cases (49 in all), including its outage case. `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and `@nxgt/janus-redis` implement it, with no migration, sync or new Redis command. The port also now states something the core relies on: a read sees every write that completed before it, so never read from a secondary or a read replica. No suite can check this.
  - **janus-telemetry:** `janus.signIn.secondFactor` carries the `user.id` of the user asked for a code.

### Patch Changes

- Updated dependencies [[`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f)]:
  - @nxgt/janus@0.7.0

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
