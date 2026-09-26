# @nxgt/janus-telemetry

## 0.3.2

### Patch Changes

- Updated dependencies [[`206c2f0`](https://github.com/softistx/nxgt-janus/commit/206c2f0a2c496b964199a9f3cce5fb9d379cb1a2)]:
  - @nxgt/janus@0.8.0

## 0.3.1

### Patch Changes

- [#66](https://github.com/softistx/nxgt-janus/pull/66) [`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - At most one sign-in code live per user, and challenges that end when they should.
  
  - **At most one sign-in code is live per user.** `signInCode.request` issues its code, then spends every other challenge of that user, so only the code in the last e-mail works and an earlier one answers `TOKEN_SPENT`. Requests that race cannot each keep a code: at most one survives. Rate-limit `request` per address, because every call sends an e-mail and cancels the code before it.
  - **Writing a password ends the sign-ins left waiting on a second factor.** `resetPassword.confirm`, `setPassword` and `changePassword` spend every open `secondFactor` challenge of the user, so whoever had the old password cannot finish a sign-in they started with it.
  - **A sign-in that is still running when the password is written is refused.** `signIn` reads the user again once it has answered. If the password it verified is no longer theirs, it revokes the session it opened, or spends its challenge, and throws `CREDENTIALS_INVALID`. A hash rewritten for the same password is not a change.
  - **Another user type's `confirm` spends a challenge at its fifth attempt**, as a fifth wrong code does. This applies to `secondFactor.confirm` and `signInCode.confirm`. Calls after that answer `TOKEN_SPENT`, where they used to answer `CODE_INVALID` with `attemptsLeft: 0`.
  - **`verifyEmail.confirm` and `resetPassword.confirm` check the e-mail again on the record they write.** An address changed while the link was being redeemed answers `TOKEN_STALE`, and nothing is written.
  - **`SecondFactorRequired` carries `userId`**, for your logs and rate limits. Answer the visitor the challenge alone.
  - **For adapter authors:** `TokenStore` gains `spendUserTokens(userId, kind, at, except?)`. It spends the unspent tokens of one user and one kind, except the one whose hash is `except`, and answers how many. It never spends a token that a racing `consumeToken` also spends. The conformance suite has four new cases (49 in all), including its outage case. `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and `@nxgt/janus-redis` implement it, with no migration, sync or new Redis command. The port also now states something the core relies on: a read sees every write that completed before it, so never read from a secondary or a read replica. No suite can check this.
  - **janus-telemetry:** `janus.signIn.secondFactor` carries the `user.id` of the user asked for a code.
- Updated dependencies [[`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f)]:
  - @nxgt/janus@0.7.0

## 0.3.0

### Minor Changes

- [#64](https://github.com/softistx/nxgt-janus/pull/64) [`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Sign in with a code sent by e-mail, with no password needed.
  
  - `auth.<type>.signInCode.request(email)` answers `{ code, challenge, email, expiresAt, user }`. It answers `null` when nobody holds that e-mail or the user is inactive, and never says which. Send `code` by e-mail, and keep `challenge` with the visitor.
  - `auth.<type>.signInCode.confirm(challenge, code)` checks the code, marks the e-mail verified and signs the user in. A user with an active second factor is still asked for it.
  - The code is six digits and lives ten minutes (`tokens.signInCode`). It takes five attempts, counted by the store before the code is compared. Only its hash is stored, keyed by the challenge.
  - **Rate-limit `request` per e-mail and per client.** Every call issues a new challenge with five attempts of its own, so the attempts bound one challenge, not one account.
  - It exists on every user type with an e-mail, including one without a password.
  - **janus-telemetry:** a new `janus.signInCode.sent` event. A sign-in by code is a `janus.signIn` event with `janus.signIn.code: true`, and a refused code is a `janus.signIn.refused` warning, marked the same way. Neither the code nor the challenge is ever written.
  - **janus-hono:** the routes guide shows a sign-in by code.

### Patch Changes

- Updated dependencies [[`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579)]:
  - @nxgt/janus@0.6.0

## 0.2.0

### Minor Changes

- [#62](https://github.com/softistx/nxgt-janus/pull/62) [`daa00a1`](https://github.com/softistx/nxgt-janus/commit/daa00a196bd1935d8d53cdb6481367e41e65ee4d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A TOTP second factor, for every user type with a password.
  
  - `janus({ secondFactor: { issuer, keys } })` turns it on. `keys` seal every TOTP secret with AES-256-GCM before a store sees it. The first key seals and every key opens, so keys rotate.
  - `auth.<type>.secondFactor` has four flows:
    - `enroll(user)` answers `{ secret, uri }`.
    - `activate(user, code)` makes the factor active.
    - `disable(user)` removes it.
    - `confirm(challenge, code)` opens the session.
  - **Breaking, once `secondFactor` is configured:** `signIn` answers `{ status: 'signedIn', … }` or `{ status: 'secondFactor', challenge, expiresAt }`. Switch on `status`. Without `secondFactor`, `signIn` still answers a session. `SignedIn` now carries `status: 'signedIn'` everywhere.
  - A challenge lives five minutes and takes five attempts. A code is accepted once. A user with an active factor is never signed in by a `janus()` without keys: that is a `TypeError`.
  - New codes: `CODE_INVALID` (a `TokenError`, carrying `attemptsLeft`), `SECOND_FACTOR_NOT_ENROLLED` and `SECOND_FACTOR_ACTIVE` (a new `SecondFactorError`).
  - `User` gains `hasSecondFactor`, and a schema may no longer declare that field.
  - **janus-hono:** `CODE_INVALID` is answered 401, with `attemptsLeft` in the body. The two `SECOND_FACTOR_*` codes are answered 409.
  - **janus-telemetry:** `janus.signIn` records `janus.signIn.status`. New events: `janus.signIn.secondFactor`, and `janus.secondFactor.enrolled`, `.activated` and `.disabled`. A refused code warns with `janus.secondFactor.attemptsLeft`. No secret, challenge or code is ever written.

### Patch Changes

- Updated dependencies [[`daa00a1`](https://github.com/softistx/nxgt-janus/commit/daa00a196bd1935d8d53cdb6481367e41e65ee4d)]:
  - @nxgt/janus@0.5.0

## 0.1.2

### Patch Changes

- Updated dependencies [[`23c5801`](https://github.com/softistx/nxgt-janus/commit/23c5801d801bb927b137da7f88d6abfee853900d)]:
  - @nxgt/janus@0.4.0

## 0.1.1

### Patch Changes

- [#58](https://github.com/softistx/nxgt-janus/pull/58) [`93c1530`](https://github.com/softistx/nxgt-janus/commit/93c1530a5a1ae406dbc345e1c20a81da4f074272) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The audit trail records a subject as `permissions()` reads it. `janus.subject.relation` was set whenever the subject had a `relation` field, so a user with such a field was logged as a subject set that was never stored. It is now set only for a real set: one `setOf()` made, or `{ type, id, relation }` on an object type. The user types come from the instance's `model`. Needs `@nxgt/janus` 0.3.0, for `isSetOf`.
- Updated dependencies [[`9c64782`](https://github.com/softistx/nxgt-janus/commit/9c64782611e21e6e62d5cd332b48f982f2cbbc63)]:
  - @nxgt/janus@0.3.0

## 0.1.0

### Minor Changes

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`ebe6b61`](https://github.com/softistx/nxgt-janus/commit/ebe6b6102bde1d78e52991ba9a41f019ac92452e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `instrumentJanus` and `instrumentPermissions` wrap an instance of `@nxgt/janus` so that every flow and every permission check is a span, and the security events worth an audit trail are recorded — never a login, an e-mail, a password, a session token, a one-time token or a session id.

### Patch Changes

- Updated dependencies [[`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904)]:
  - @nxgt/janus@0.2.2
