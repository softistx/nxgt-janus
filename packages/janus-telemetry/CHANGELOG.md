# @nxgt/janus-telemetry

## 0.7.0

### Minor Changes

- [#171](https://github.com/softistx/nxgt-janus/pull/171) [`203190f`](https://github.com/softistx/nxgt-janus/commit/203190f032dbd2f451f28a244f85ff57f0502713) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Sign-in links in the audit trail, for `@nxgt/janus` 0.15's `magicLink`:
  
  - `janus.magicLink.sent` when `magicLink.request` issued a link — never its token, nor the address; nothing when it answered `null`.
  - A sign-in by link is `janus.signIn` with `janus.signIn.magicLink: true`, and each refusal of `magicLink.confirm` a `janus.signIn.refused` with the same mark and its `janus.refusal` code. A link that asks for the second factor is `janus.signIn.secondFactor`.
  - The `magicLink.confirm` span records `janus.signIn.status`, `signedIn` or `secondFactor`, as `signIn`'s and `signInCode.confirm`'s do.
  
  Without this release, sign-ins by link are missing from the audit trail.

### Patch Changes

- Updated dependencies [[`c69356d`](https://github.com/softistx/nxgt-janus/commit/c69356da514446558f728ac45981aaecef88be1d), [`3468e6b`](https://github.com/softistx/nxgt-janus/commit/3468e6b1e010e2e50cb0e2e0cf299f469aadf906)]:
  - @nxgt/janus@0.15.0

## 0.6.0

### Minor Changes

- [#169](https://github.com/softistx/nxgt-janus/pull/169) [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — `signIn` now throttles password guessing, on by default.** Past ten passwords tried at one login in a 15-minute window, `signIn` answers `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter` — the seconds until the next window — **even for the right password**, until the window ends. Nothing locks: the next window signs in. A login nobody holds is counted as a registered one is, so the throttle does not reveal which logins exist; a password sign-in that opens a session starts the login's count again — with a second factor active, only its code or a recovery code does, so the password alone buys no more than ten challenges per window; the count is taken before anything is compared, so of twenty passwords tried at once exactly ten are. `janus({ signIn: { throttle: { attempts, window } } })` changes the limit, and **`signIn: { throttle: false }` turns it off** — a test suite that tries more than ten wrong passwords at one login over a `fixedClock` needs one or the other. The counts live in the tokens store as `secondFactor` tokens named by a keyed hash of the login — no change for adapters, and a flushed or evicting Redis forgets them. **On PostgreSQL, lapsed tokens are never collected**: every login tried, registered or not, adds a row per window, so schedule `delete from tokens where expires_at < now() - interval '1 hour'` (schema-qualified if your tables have their own schema). Somebody who knows a login can keep its password sign-in shut by trying ten passwords every window; a sign-in code, when wired, still opens it. **A tokens store that cannot count now fails every password sign-in with `STORE_FAILED`** (fail closed), where before `signIn` read no token. `JanusError` gains `retryAfter`, and `CredentialRefusal` gains `'throttled'`: a `switch` over it that is exhaustive stops compiling until it handles it. Six new compile-time refusals (137 in all). This corrects 0.13.0's note that nothing counts failed passwords: `signIn` now counts them per login, and the passwords guide says so; a limiter per client is still yours. `@nxgt/janus-hono`: `bodyOf()` answers a throttled refusal `{ code, retryAfter }` and `janusErrors()` adds a `Retry-After` header. `@nxgt/janus-graphql`: `janusGraphQLError()` puts `retryAfter` in `extensions` and a `Retry-After` header in `extensions.http.headers`. `@nxgt/janus-telemetry`: a throttled sign-in is a `janus.signIn.throttled` warning with `janus.signIn.retryAfter`, instead of `janus.signIn.refused`.

### Patch Changes

- Updated dependencies [[`f171ae3`](https://github.com/softistx/nxgt-janus/commit/f171ae3abed8780e9cf61999daf48a3d2cd192ef), [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10)]:
  - @nxgt/janus@0.14.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0

## 0.5.0

### Minor Changes

- [#158](https://github.com/softistx/nxgt-janus/pull/158) [`628385f`](https://github.com/softistx/nxgt-janus/commit/628385f476826095b9fc7fb8483f466c99b22fdc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A step-up is written: `janus.stepUp.asked` (info, with `janus.stepUp.via` — `email` or `secondFactor`), `janus.stepUp.confirmed` (info) and `janus.stepUp.refused` (**warn**, with `janus.refusal` and, for `CODE_INVALID`, `janus.secondFactor.attemptsLeft`), each with the `user.id` — never the code nor the challenge. The `stepUp.confirm` span names the session's user, not the session's id. `STEP_UP_REQUIRED`, from `assertFresh`, is a refusal: the span stays `ok`.

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0

## 0.4.1

### Patch Changes

- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0

## 0.4.0

### Minor Changes

- [#146](https://github.com/softistx/nxgt-janus/pull/146) [`a5bc514`](https://github.com/softistx/nxgt-janus/commit/a5bc5147313fa73cbd3f848d2636438bc844896d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Recovery codes in the audit trail. A sign-in by `secondFactor.recover` is a `janus.signIn` with `janus.signIn.recoveryCode: true` and `janus.secondFactor.recoveryCodesLeft`, a count and never a code; its refusals are `janus.signIn.refused` with the same mark. `regenerateRecoveryCodes` writes `janus.secondFactor.recoveryCodesRegenerated` with the `user.id` it was called for. No recovery code reaches a span or an event.

### Patch Changes

- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0

## 0.3.5

### Patch Changes

- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129)]:
  - @nxgt/janus@0.9.0

## 0.3.4

### Patch Changes

- [#92](https://github.com/softistx/nxgt-janus/pull/92) [`a0efa15`](https://github.com/softistx/nxgt-janus/commit/a0efa15954c723fe11678db2cb1e6f1f8cf470b0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Peer `@nxgt/telemetry` by `>=0.2.1 <1` instead of `^0.2.1`, which on a `0.x` version admitted `0.2.x` only: a later minor of `@nxgt/telemetry` no longer raises a peer conflict. The README now states that range exactly.

## 0.3.3

### Patch Changes

- [#88](https://github.com/softistx/nxgt-janus/pull/88) [`f110240`](https://github.com/softistx/nxgt-janus/commit/f110240ee02a4ce3b34b1313c172d3de5d3b5bb9) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the README gains "Type safety, counted": the six plausible mistakes `test/types/instrument.ts` measures — three refusals of `@nxgt/janus` that survive instrumenting, and three of this package's own.
- Updated dependencies [[`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e)]:
  - @nxgt/janus@0.8.6

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
