# @nxgt/janus-redis

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

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`6ae6f84`](https://github.com/softistx/nxgt-janus/commit/6ae6f847317f91d836f50666fe6edc5c9d9b6a17) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: sessions and one-time tokens for `@nxgt/janus` in Redis, over `@nxgt/redis`, expired by Redis itself while users stay in another store. It passes the conformance suite for both stores on Redis 7.4.

### Patch Changes

- Updated dependencies [[`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904)]:
  - @nxgt/janus@0.2.2
