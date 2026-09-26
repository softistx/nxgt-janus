# @nxgt/janus-mongo

## 0.4.0

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

## 0.3.2

### Patch Changes

- Updated dependencies [[`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579)]:
  - @nxgt/janus@0.6.0

## 0.3.1

### Patch Changes

- [#62](https://github.com/softistx/nxgt-janus/pull/62) [`6ecc391`](https://github.com/softistx/nxgt-janus/commit/6ecc391abfddef55fd4426fd96ecabeb3295308d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The second factor's secret is described as it now is: sealed by `@nxgt/janus` with AES-256-GCM before the store sees it. The docs add a query to find secrets still sealed with a key you are rotating out.
- Updated dependencies [[`daa00a1`](https://github.com/softistx/nxgt-janus/commit/daa00a196bd1935d8d53cdb6481367e41e65ee4d)]:
  - @nxgt/janus@0.5.0

## 0.3.0

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
