# @nxgt/janus

## 0.14.0

### Minor Changes

- [#167](https://github.com/softistx/nxgt-janus/pull/167) [`f171ae3`](https://github.com/softistx/nxgt-janus/commit/f171ae3abed8780e9cf61999daf48a3d2cd192ef) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Two new user events, so a listener can tell the user their password or e-mail changed — whoever changed it:
  
  - **`user.passwordChanged`**, sent by `changePassword` and `setPassword` once the password is written and the older reset links and second-factor challenges are spent — from a `finally`, so an outage spending them still reports the write. A reset is still `user.passwordReset` alone, never both: a listener that cares about every new password handles both types. A `changePassword` refused sends nothing; a first password `setPassword` gives a user created without one sends it too.
  - **`user.emailChanged`**, sent by an `update` that changed the e-mail — added, replaced or removed — compared normalised, the same test that makes the new address unverified: a change of case only sends nothing. It carries **`formerEmail`**, the address before the update as it was stored, or `null` for a user who had none — the one event that carries more than the user's id, since nothing keeps the old address once the write landed and a notice belongs in that inbox:
  
  ```ts
  if (event.type === 'user.emailChanged' && event.formerEmail != null) {
  	const user = await auth.get(event.userId);
  	await mail.emailChanged({ name: user.name, formerEmail: event.formerEmail, newEmail: user.email });
  }
  ```
  
  `UserEvent` gains `formerEmail?: string | null`, absent on every other type. Both are sent after the write, awaited, and a listener that throws is a `JANUS_EVENT_FAILED` warning, never a failed flow, as for the other types.
  
  **Breaking for an exhaustive `switch`: `UserEventType` has two more members**, `'user.passwordChanged'` and `'user.emailChanged'`. A `switch` that exhausts it no longer compiles until it handles them. Receivers on `@nxgt/janus-webhooks` before 0.6.0 answer `null` for the two new types, and a `@nxgt/janus-webhooks-redis` queue before 0.4.0 cannot read them back: upgrade them first, or leave the types out of their endpoint's `types`.

- [#169](https://github.com/softistx/nxgt-janus/pull/169) [`b3c2487`](https://github.com/softistx/nxgt-janus/commit/b3c248732df07bac2d5ca4e8d218092b491b7b10) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — `signIn` now throttles password guessing, on by default.** Past ten passwords tried at one login in a 15-minute window, `signIn` answers `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter` — the seconds until the next window — **even for the right password**, until the window ends. Nothing locks: the next window signs in. A login nobody holds is counted as a registered one is, so the throttle does not reveal which logins exist; a password sign-in that opens a session starts the login's count again — with a second factor active, only its code or a recovery code does, so the password alone buys no more than ten challenges per window; the count is taken before anything is compared, so of twenty passwords tried at once exactly ten are. `janus({ signIn: { throttle: { attempts, window } } })` changes the limit, and **`signIn: { throttle: false }` turns it off** — a test suite that tries more than ten wrong passwords at one login over a `fixedClock` needs one or the other. The counts live in the tokens store as `secondFactor` tokens named by a keyed hash of the login — no change for adapters, and a flushed or evicting Redis forgets them. **On PostgreSQL, lapsed tokens are never collected**: every login tried, registered or not, adds a row per window, so schedule `delete from tokens where expires_at < now() - interval '1 hour'` (schema-qualified if your tables have their own schema). Somebody who knows a login can keep its password sign-in shut by trying ten passwords every window; a sign-in code, when wired, still opens it. **A tokens store that cannot count now fails every password sign-in with `STORE_FAILED`** (fail closed), where before `signIn` read no token. `JanusError` gains `retryAfter`, and `CredentialRefusal` gains `'throttled'`: a `switch` over it that is exhaustive stops compiling until it handles it. Six new compile-time refusals (137 in all). This corrects 0.13.0's note that nothing counts failed passwords: `signIn` now counts them per login, and the passwords guide says so; a limiter per client is still yours. `@nxgt/janus-hono`: `bodyOf()` answers a throttled refusal `{ code, retryAfter }` and `janusErrors()` adds a `Retry-After` header. `@nxgt/janus-graphql`: `janusGraphQLError()` puts `retryAfter` in `extensions` and a `Retry-After` header in `extensions.http.headers`. `@nxgt/janus-telemetry`: a throttled sign-in is a `janus.signIn.throttled` warning with `janus.signIn.retryAfter`, instead of `janus.signIn.refused`.

## 0.13.0

### Minor Changes

- [#164](https://github.com/softistx/nxgt-janus/pull/164) [`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — security fix: an old reset link no longer works.** `resetPassword.request` now spends the user's earlier reset links, so only the last e-mail's link works, and every password write — `resetPassword.confirm`, `changePassword` and `setPassword` — spends every reset link still live. Before, a link sent before the password was reset or changed could still replace the new password. Such a link now answers `TOKEN_SPENT`. The links are spent after the password is written; an outage at that step fails the call with `STORE_FAILED`, and the next `request` spends them. Sign-in codes and step-ups are not spent: the password proves neither. No change for adapters: the existing `TokenStore.spendUserTokens` does it. Docs: the passwords guide says to rate-limit `signIn` per login and per client — nothing counts failed passwords.

## 0.12.0

### Minor Changes

- [#158](https://github.com/softistx/nxgt-janus/pull/158) [`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A step-up: a signed-in user proves again who they are before a sensitive action — changing the e-mail, disabling the second factor, deleting the account.
  
  - `stepUp.request(user)`, on every user type with an e-mail, issues a challenge: with a six-digit code to e-mail (`via: 'email'`), or — for a user whose second factor is active — to confirm with a code from their app (`via: 'secondFactor'`), so a step-up is never weaker than the sign-in the account asks for. One step-up is live per user; a challenge lives `'10m'`, `tokens.stepUp` in `janus()`'s configuration.
  - `stepUp.confirm(request, challenge, code)` checks the code and moves `authenticatedAt` of the session the request presents to now, answering that session. It opens no session. Five attempts per challenge; an app's codes are also counted per user, five per 15-minute window, in the count `regenerateRecoveryCodes` keeps.
  - `assertFresh(session, maxAge, clock?)` refuses a session that proved who it is `maxAge` ago or more with `StepUpRequiredError`, a new exported class.
  - **Breaking for an exhaustive `switch`: `JanusErrorCode` gains `'STEP_UP_REQUIRED'`**, which `statusOf` answers 403.
  - `session.authenticatedAt` is when the session last proved who it is — at the sign-in, or since by a step-up — no longer only when it was opened.
  - A step-up whose session is signed out while the code is checked is `TOKEN_UNKNOWN`, `stepUp.confirm: the session was signed out while the code was checked` — the session is never brought back.

- [#157](https://github.com/softistx/nxgt-janus/pull/157) [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The store port gains what a step-up needs — a signed-in user confirming a sensitive action. No flow uses it yet: `stepUp.request` and `stepUp.confirm` come next.
  
  - **Breaking for an adapter: `SessionStore.reauthenticateSession(id, at)` is a new required method.** It moves a standing session's `authenticatedAt` to `at`, in one conditional write, and answers the record as written; `null` for no session or a revoked one, which it never brings back. `janus()` refuses a store without it at wiring: `store.sessions has no method reauthenticateSession`.
  - **Breaking for an exhaustive `switch`: `TokenKind` gains `'stepUp'`**, the challenge of a step-up — a kind of its own, so a sign-in code never confirms an action nor an action's code signs anyone in. A store that lists the kinds — a `CHECK`, a validator's enum — adds it.
  - The conformance suite has 54 cases, five of them new: `sessions.reauthenticate`, `sessions.reauthenticateRace` (a confirmation racing a revocation never brings the session back), `tokens.everyKind` (a token of every kind stored, counted and spent), `tokens.stepUpKind`, and `outage.reauthenticateSession`.

## 0.11.0

### Minor Changes

- [#154](https://github.com/softistx/nxgt-janus/pull/154) [`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `auth.secondFactor.recoveryCodesLeft(user)` answers how many recovery codes the user still holds: the count `recover` answers as `recoveryCodesLeft`, read again for whoever did not see that answer. A `user.recoveryCodeUsed` listener names the user only, so it can now tell the user how many codes remain:
  
  ```ts
  if (event.type === 'user.recoveryCodeUsed') {
  	const left = await auth.secondFactor.recoveryCodesLeft(event.userId); // 9
  }
  ```
  
  It answers `null` for a user with no active factor — none, or one still waiting for its first code — and `0` for an active factor whose codes are all spent. An unknown id is `NOT_FOUND`, and a store that fails throws `STORE_FAILED`. It writes nothing and needs no key. Using the answer as a `number` without checking for `null` is a compile error, which brings the refusal count to 124.

## 0.10.0

### Minor Changes

- [#147](https://github.com/softistx/nxgt-janus/pull/147) [`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `statusOf(code)` is exported from `@nxgt/janus`: the HTTP status each `JanusErrorCode` deserves — `STORE_FAILED` 503 and nothing else, `NOT_FOUND` 404, `CREDENTIALS_INVALID` and `CODE_INVALID` 401, … — typed as `JanusErrorStatus`, the union of the eight literals it answers. It is the one table the integrations share, so a Hono route and a GraphQL field answer a code the same way; the errors guide now imports it instead of writing it out.
  
  `CheckArgs<C, T, P>`, the options argument of `can()` — `ctx` required exactly when a `when` is reachable — is exported from `@nxgt/janus/permissions` as a type, for a function of your own that wraps `can()` and should refuse the same mistakes.

- [#146](https://github.com/softistx/nxgt-janus/pull/146) [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Recovery codes for the TOTP second factor: a user whose phone is gone can still sign in, without an operator resetting the account.
  
  - **`secondFactor.activate` now answers `{ user, recoveryCodes }`**: ten codes, written `xxxxx-xxxxx`, shown once. Only their keyed hashes are stored (HMAC-SHA-256 under a key derived from `secondFactor.keys`, bound to the user's id), so no call answers them again.
  - **`secondFactor.recover(challenge, code)`** redeems `signIn`'s challenge with a recovery code instead of the app's code, and answers the session with `recoveryCodesLeft`. The code is spent in one write under the version read: of two sign-ins using the same code at once, one opens a session and the other is `VERSION_CONFLICT`. The challenge's five attempts are shared with `confirm`, and a wrong or used code is `CODE_INVALID` with `attemptsLeft`.
  - **`secondFactor.regenerateRecoveryCodes(user, code)`** takes a fresh code from the app, replaces every code, and answers the new ones once. It is `SECOND_FACTOR_NOT_ENROLLED` without an active factor: `secondFactor.regenerateRecoveryCodes: the user has no active second factor — recovery codes come with one`.
  - `disable` removes the codes with the factor.
  - Two new user events: `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed`, named by id alone like the others.
  
  **Breaking: `activate` answers `{ user, recoveryCodes }`, not the user.** `(await auth.secondFactor.activate(user, code)).hasSecondFactor` no longer compiles (`TS2339 … on type 'RecoveryCodesIssued<…>'`); read `.user`, and show `recoveryCodes` to the user.
  
  **Breaking: `UserEventType` has two more members.** A `switch` that exhausts it no longer compiles until it handles them. Receivers on `@nxgt/janus-webhooks` before 0.4.0 answer `null` for the two new types: upgrade them first, or leave the types out of their endpoint's `types`.
  
  **Keep a sealing key while recovery codes are hashed with it.** A code hashed under a key no longer in `secondFactor.keys` is a bare `TypeError`: `<call>: a recovery code is hashed with the key "<id>", which secondFactor.keys no longer holds — keep a key until no secret or recovery code uses it`. Codes cannot be hashed again under the new key, since only their hashes are kept: regenerate them, or keep the old key.

- [#143](https://github.com/softistx/nxgt-janus/pull/143) [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The identity stores' port gains a user's recovery codes. `SecondFactorRecord` has a new field, `recoveryCodes: readonly string[]`: the keyed hashes of the codes a user can sign in with when their phone is gone, opaque to a store like `secret`, in order, and `[]` for none. A patch that names `secondFactor` replaces the codes whole, and `secondFactor: null` removes them with the factor. `enroll` now writes a factor with `recoveryCodes: []`.
  
  The conformance case `users.secondFactorSlot` checks it: the codes round-trip in order, `[]` comes back as a factor with no codes and never as `null`, a patch replaces the array whole, and `secondFactor: null` clears it. The case now lives in `conformance/cases/users/second-factor.ts`; its id is unchanged.
  
  **Breaking for a third-party adapter: it must store and answer `recoveryCodes`.** Until it does, it no longer compiles against `SecondFactorRecord`, and `users.secondFactorSlot` fails. Read a factor written before the field existed as `[]` — a nullable column, an optional field — rather than rewriting every user. The port change alone changes nothing for an application; the flows that hand out and accept the codes, and what they change, are in their own entry. The official adapters follow in `@nxgt/janus-drizzle` 0.4 and `@nxgt/janus-mongo` 0.5; `@nxgt/janus-redis` stores no user.

- [#149](https://github.com/softistx/nxgt-janus/pull/149) [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change: `secondFactor.regenerateRecoveryCodes` counts its attempts.** Its code from the app was the only thing between a stolen session and new recovery codes, and nothing bounded the guesses. It now takes five attempts per user per 15-minute window — the same five a challenge takes — counted by the store before the code is compared, so every process over the same store shares the count.
  
  - A code that does not match is `CODE_INVALID` with `attemptsLeft`: what the window has left. It carried none before.
  - Past the fifth, every call in the window is `CODE_INVALID` with `attemptsLeft: 0` — **the right code included**, compared by nobody — and writes nothing: `secondFactor.regenerateRecoveryCodes: too many codes tried — wait for the next 15-minute window`. Tell the user to wait; `attemptsLeft: 0` also comes with the fifth wrong code, after which the next call is this refusal.
  - A code accepted — a regenerate, or a sign-in finished with the app — starts the count again. A password written does not.
  - The same code tried twice at once regenerates once; the other call is `VERSION_CONFLICT`. A store that fails throws `STORE_FAILED`, never a refusal.
  
  No port change: the count is a one-time token of kind `secondFactor`, counted by `TokenStore.countAttempt`, whose secret is a keyed hash nobody is given — it cannot be redeemed as a challenge. No adapter or migration to update.

## 0.9.0

### Minor Changes

- [#125](https://github.com/softistx/nxgt-janus/pull/125) [`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Two new user events tell you when a user's second factor was turned on or off:
  
  - `user.secondFactorEnabled` is sent by `secondFactor.activate`, once the first code made the factor active. `enroll` sends nothing, because it only leaves the factor waiting.
  - `user.secondFactorDisabled` is sent by `secondFactor.disable` when it removed an active factor. A user who had no factor, a factor still waiting for its first code, or a second `disable` sends nothing.
  
  Both follow the other events' rules: the listener runs after the write and is awaited, the event names the user by id alone, a refused call sends nothing, and a listener that throws fails no flow but is reported as a `JANUS_EVENT_FAILED` warning.
  
  `UserEventType` now has six members. A `switch` over `event.type` that ends in a `never` check stops compiling until it handles the two new ones. Upgrade `@nxgt/janus-webhooks` and `@nxgt/janus-webhooks-redis` with this version, and upgrade every webhook receiver before the sender.

## 0.8.8

### Patch Changes

- [#97](https://github.com/softistx/nxgt-janus/pull/97) [`9f196da`](https://github.com/softistx/nxgt-janus/commit/9f196da2edcd9231fdc3a21a5f928fa085bf5ab4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the roadmap and the e-mail guides point to `@nxgt/janus-mail`, now released, for the flows' e-mails ready-made in English and French.

## 0.8.7

### Patch Changes

- [#94](https://github.com/softistx/nxgt-janus/pull/94) [`1e3a5c5`](https://github.com/softistx/nxgt-janus/commit/1e3a5c582a1fc280eabf865fea77d25089ed91ee) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The guides point to `@nxgt/janus-mail`, the ready-made e-mails of the flows — in progress and private: e-mail verification and password reset in `email-flows.md`, the sign-in code in `sign-in-code.md`, and the roadmap entry *Sending the e-mails* moves to *Now*. The vocabulary gains *issued* and *notice*, and *integration* names the mail package.

## 0.8.6

### Patch Changes

- [#90](https://github.com/softistx/nxgt-janus/pull/90) [`24b2067`](https://github.com/softistx/nxgt-janus/commit/24b20673eea1f96316a216b2b2c973bbd493330e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the minimum server versions the READMEs promise are now tested on every CI run, and the docs say so. `@nxgt/janus-drizzle` passes both conformance suites on PostgreSQL 15 as well as 17, over each driver; `@nxgt/janus-redis` and `@nxgt/janus-webhooks-redis` pass theirs on Redis 7.0 and Valkey 7.2 as well as Redis 7.4. The adapters guide of `@nxgt/janus` lists the same versions.

## 0.8.5

### Patch Changes

- [#80](https://github.com/softistx/nxgt-janus/pull/80) [`fd78107`](https://github.com/softistx/nxgt-janus/commit/fd78107d8906c0eba023ffcb28282c0e417b473d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Conformance: a suite run from the published package now recognises two copies of `@nxgt/janus` — `the error is named StoreFailure but is not @nxgt/janus's StoreFailure: two copies of @nxgt/janus are installed …` — instead of answering `expected StoreFailure2, got StoreFailure`. The bundler renames the class in `dist`, and the probe compared against that renamed name.

## 0.8.4

### Patch Changes

- [#77](https://github.com/softistx/nxgt-janus/pull/77) [`8bb87ea`](https://github.com/softistx/nxgt-janus/commit/8bb87ea1943dc473c450337f99036e4670eff402) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Permissions: `list()` through a `fromField` with no `lookup` now names the subject's type in its `TypeError` — `…has no lookup to find the records naming a subject of type 'staff' — …` — never the subject's id: a message reports a shape, never a value.

## 0.8.3

### Patch Changes

- [#75](https://github.com/softistx/nxgt-janus/pull/75) [`1c179bd`](https://github.com/softistx/nxgt-janus/commit/1c179bd3a0fd834b8ac2826e01440475c879eb95) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Permissions: an object or subject id holding a NUL character or a lone surrogate — which no store can keep — is held by nobody. `can()` answers `false` and `list()` an empty page for one before any store call, a `fromField` whose value holds one names nobody, `list()` leaves out one a `lookup` answers, and `grant()` and `revoke()` refuse one with a `TypeError` instead of reaching the store, where PostgreSQL alone failed with `STORE_FAILED`. The relation store conformance suite adds `relations.edgeCharacters`: every other character in an id round-trips.

## 0.8.2

### Patch Changes

- [#72](https://github.com/softistx/nxgt-janus/pull/72) [`14fd30c`](https://github.com/softistx/nxgt-janus/commit/14fd30cde0a96dd93c1a199418196443ccde24df) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists `@nxgt/janus-webhooks` v0.1.0 as shipped, and the events guide, the README and the JSDoc of `events` point to it as released.

## 0.8.1

### Patch Changes

- [#70](https://github.com/softistx/nxgt-janus/pull/70) [`396f4dc`](https://github.com/softistx/nxgt-janus/commit/396f4dc38dbc76b462da78833784f71b2abbdbd4) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap moves Webhooks to Now: `@nxgt/janus-webhooks`, the package that signs and delivers user events, is under way.

## 0.8.0

### Minor Changes

- [#68](https://github.com/softistx/nxgt-janus/pull/68) [`206c2f0`](https://github.com/softistx/nxgt-janus/commit/206c2f0a2c496b964199a9f3cce5fb9d379cb1a2) Thanks [@SteveGT96](https://github.com/SteveGT96)! - User events: `janus({ events })` hears what happened to a user once it is written.
  
  - `events` is one function, called with a `UserEvent` of type `user.created` (`create`, `signUp`), `user.emailVerified` (`verifyEmail.confirm`, and the link of `resetPassword.confirm` or the code of `signInCode.confirm`, never for an e-mail already verified), `user.passwordReset` (`resetPassword.confirm`) or `user.deleted` (`delete`, once).
  - An event names the user by id alone: `{ id, type, occurredAt, userId, userType }`. Its `id` is a UUIDv7 minted for it, which is the key to deliver it once. It carries no login, no e-mail, no field and no secret.
  - The listener runs after the write has landed — `signUp` before it opens the session, `signInCode.confirm` before it opens the session or the second-factor challenge; `resetPassword.confirm` after it revokes the old sessions, and `delete` after it removes the sessions, tokens and tuples, sending the event even when a store outage interrupts those — and is awaited before the flow answers, so a durable queue has the event by then. `occurredAt` is the write's own time. A listener that throws fails no flow: the write happened. The failure is a `JANUS_EVENT_FAILED` warning that names the event type, its id and the user id, never the failure's message.
  - `webhooks({ … })` from the coming `@nxgt/janus-webhooks` will sign and deliver the events; any function will do meanwhile.

## 0.7.0

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

## 0.6.0

### Minor Changes

- [#64](https://github.com/softistx/nxgt-janus/pull/64) [`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Sign in with a code sent by e-mail, with no password needed.
  
  - `auth.<type>.signInCode.request(email)` answers `{ code, challenge, email, expiresAt, user }`. It answers `null` when nobody holds that e-mail or the user is inactive, and never says which. Send `code` by e-mail, and keep `challenge` with the visitor.
  - `auth.<type>.signInCode.confirm(challenge, code)` checks the code, marks the e-mail verified and signs the user in. A user with an active second factor is still asked for it.
  - The code is six digits and lives ten minutes (`tokens.signInCode`). It takes five attempts, counted by the store before the code is compared. Only its hash is stored, keyed by the challenge.
  - **Rate-limit `request` per e-mail and per client.** Every call issues a new challenge with five attempts of its own, so the attempts bound one challenge, not one account.
  - It exists on every user type with an e-mail, including one without a password.
  - **janus-telemetry:** a new `janus.signInCode.sent` event. A sign-in by code is a `janus.signIn` event with `janus.signIn.code: true`, and a refused code is a `janus.signIn.refused` warning, marked the same way. Neither the code nor the challenge is ever written.
  - **janus-hono:** the routes guide shows a sign-in by code.

## 0.5.0

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

## 0.4.0

### Minor Changes

- [#60](https://github.com/softistx/nxgt-janus/pull/60) [`23c5801`](https://github.com/softistx/nxgt-janus/commit/23c5801d801bb927b137da7f88d6abfee853900d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The store port gains what one-time codes need. No flow uses it yet: the second factor and e-mail sign-in codes come next.
  
  - `UserRecord.secondFactor` is a TOTP secret, which the core will seal once the second factor ships, with its confirmation and the last step accepted, or `null`. `UserPatch` names it like `password`.
  - `TokenRecord` gains `codeHash` and `attempts`, and `TokenKind` gains `'secondFactor'` and `'signInCode'`.
  - `TokenStore.countAttempt(tokenHash, kind)` is a new required method. It is one conditional write that counts an attempt at a code and answers the token after it. A spent token is answered as it is, and an unknown one is `null`.
  
  **For an adapter author:** implement `countAttempt`, store the new fields, and run the conformance suite. It has six new cases, including twenty concurrent attempts that must answer twenty distinct counts, and attempts racing a redemption that must never be counted once it spent the token.
  
  **`@nxgt/janus-drizzle`:** `users` gains four `second_factor_*` columns, and `tokens` gains `code_hash` and `attempts`. Run `drizzle-kit generate`, then migrate, before deploying.
  
  **`@nxgt/janus-mongo`:** rewrite no document, but **run `syncMongoAdapter(db)` or `syncMongoStores(db)` before deploying**. The validator the previous sync wrote refuses the new fields, so every sign-up and one-time token fails with `STORE_FAILED` (`Document failed validation`) until it runs. A document written before reads as no second factor, no code and no attempt.
  
  **`@nxgt/janus-redis`** needs no migration: a token written before reads as no code and no attempt.

## 0.3.0

### Minor Changes

- [#58](https://github.com/softistx/nxgt-janus/pull/58) [`9c64782`](https://github.com/softistx/nxgt-janus/commit/9c64782611e21e6e62d5cd332b48f982f2cbbc63) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A user type may also be an object type. `defineModel` no longer refuses `staff` under `types`. A staff member is then asked `can()`, granted relations and listed like any object; who may edit them is a relation on them.
  
  `setOf(user, relation)` is new, exported from `@nxgt/janus` with its type `SetOf` and the predicate `isSetOf`. It is the one way to write a subject set on such a type: `grant(note, 'readers', setOf(bob, 'managers'))`. A spread of a set keeps its mark; `JSON` and `structuredClone` drop it.
  
  - A user passed as it is stays that user, even with a field named `relation`. On such a type, `{ type: 'staff', id, relation }` written out is a compile error in `grant()` and `revoke()`; `can()` and `list()` accept it and ask about the user, a gap the README names.
  - A set on a user type the model does not declare under `types` is refused by `can()`, `list()`, `grant()` and `revoke()`, and by the compiler first.
  - `parseSubject` and `parseTuple` now answer a set as `setOf` makes it: frozen and marked. Compare one with `setOf(…)` or through `formatSubject`, not with a plain `{ type, id, relation }`.
  - A set passed where a relation admits only the entity is now refused at compile time, as it already was at run time.
  - `parseSubject` is typed `Entity | SetOf`.
  - The `… is no subject set` messages name the type and the relation, no longer the id: `staff#managers`, never `staff:<id>#managers`, as a message reports a shape and never a value.

## 0.2.2

### Patch Changes

- [#55](https://github.com/softistx/nxgt-janus/pull/55) [`b04520d`](https://github.com/softistx/nxgt-janus/commit/b04520df723cedb49863058d10124ee0968dd904) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap lists `@nxgt/janus-drizzle`, `@nxgt/janus-redis`, `@nxgt/janus-telemetry` and `@nxgt/janus-kit` as shipped, and every Shipped entry names the version it came in.

## 0.2.1

### Patch Changes

- [#52](https://github.com/softistx/nxgt-janus/pull/52) [`79bb857`](https://github.com/softistx/nxgt-janus/commit/79bb857a75397ea621b6e33933d4f3c6a54d322b) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A NUL character or a lone surrogate in a user's fields is refused with `USER_INVALID` on every adapter, instead of reaching PostgreSQL and answering `STORE_FAILED` — a 503 for a database that is up. So is a login your own `password.normalize` function turns into one. A login holding one is nobody's: `signIn` answers `CREDENTIALS_INVALID`, `findByLogin` and `resetPassword.request` answer `null`, and no store is asked. `signOutEverywhere` reads an `except` that is no session id as none. A schema issue's path stops before a key holding one, so it never reaches a message. The conformance suite gains `users.edgeCharacters`: every other character, control characters and surrogate pairs included, must round-trip.
  
  A user MongoDB or the memory store already holds with such a character now gets `USER_INVALID` on any `update`, since the merged fields are validated whole: clean the field first.

- [#50](https://github.com/softistx/nxgt-janus/pull/50) [`69244f8`](https://github.com/softistx/nxgt-janus/commit/69244f8e7712f474876b3bbcd091481d14daaae5) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The roadmap names what comes next: one-time codes (by e-mail, and TOTP as a second factor), sending the e-mails with `@nxgt/janus-mail` and typed, translated default templates you can extend with a language or replace one by one, and signed webhooks. The vocabulary gains a **one-time code** row.

## 0.2.0

### Minor Changes

- [#49](https://github.com/softistx/nxgt-janus/pull/49) [`579ff03`](https://github.com/softistx/nxgt-janus/commit/579ff03d84809d7f1e1bf8f4c32ce5fe76b0aa9a) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Breaking: an object type's keys are `related` and `permits`**, Keto's OPL words — `relations` and `permissions` are renamed, nothing else changes. Rules stay strings, typed and completed by your editor as before.
  
  ```ts
  defineModel({
    subjects: auth.types,
    types: {
      team: {
        related: { members: ['staff', 'team#members'], leads: ['staff'] },
        permits: { manage: ['leads'], view: ['members', 'manage'] },
      },
      record: {
        related: { doctors: fromField('doctorId', 'staff'), teams: ['team'] },
        permits: {
          view: ['doctors', 'teams->view'],
          edit: [when('doctors', (ctx: { onShift: boolean }) => ctx.onShift)],
        },
      },
    },
  });
  ```
  
  **Migrating**: rename the two keys on every object type — `relations:` → `related:`, `permissions:` → `permits:`. The old keys are refused, at compile time (`team.relations is now related: rename the key`) and with a `TypeError` from JavaScript (`defineModel: types.team.relations is now related: rename the key`). Plural relation names — `members`, `owners`, `teams` — are the convention of the docs, not a rule; `can`, `list`, `grant` and `revoke` take the names you declare.
  
  An unknown key now reads `types.<type>.<key> is not a key of an object type: related or permits`. Run-time messages name the new keys: `types.<type>.related.<relation>`, `types.<type>.permits.<permission>`. An arrow through a relation that can hold a subject set (`teams: ['team', 'team#members']`, then `'teams->view'`) was refused by `defineModel` when it ran; it is now a compile error too.

### Patch Changes

- [#41](https://github.com/softistx/nxgt-janus/pull/41) [`db8bcaf`](https://github.com/softistx/nxgt-janus/commit/db8bcafb4284fda9a6609207658e17f80c16a5aa) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `@nxgt/janus/conformance`: `sessions.deleteUser` asks the store first whether it still holds the session that lapsed, and expects `deleteUserSessions` to count it only then — 3, or 2 when the store already expired it. A store with its own expiry, a Redis key TTL, drops a lapsed session as soon as it lapses, which the port already allowed. A store that holds it and miscounts still fails.

- [#45](https://github.com/softistx/nxgt-janus/pull/45) [`67106ed`](https://github.com/softistx/nxgt-janus/commit/67106ed205eaa8725e18b08f928288ff03d867a0) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `LOGIN_TAKEN`: the message no longer quotes the login — `insertUser: the login is taken by another patient` — as a message never carries a value, and an e-mail in a log line is personal data. `error.login` and `error.userType` still name it.
  
  **For adapter authors:** `@nxgt/janus/conformance` now checks that a login conflict's message does not quote the login. An adapter that copied the old wording fails `users` until its message drops the value.

- [#44](https://github.com/softistx/nxgt-janus/pull/44) [`506075f`](https://github.com/softistx/nxgt-janus/commit/506075ff9eb11f7bb49bcde5cfd5dfe2ddf11e5d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the vocabulary names a **kit** — a package that opens the connections and wires adapters and integrations into one object, as `@nxgt/janus-kit` does.

## 0.1.3

### Patch Changes

- [#32](https://github.com/softistx/nxgt-janus/pull/32) [`fe5bbfd`](https://github.com/softistx/nxgt-janus/commit/fe5bbfd26bad216941d8743541f579ea485d81b1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `list()` offers its permission to your editor: it completed nothing, because its reversibility check was intersected with the whole union of names. It now offers the names `list()` can answer — those reaching no `fromField` without a `lookup` — and refuses the others with the same message.

- [#30](https://github.com/softistx/nxgt-janus/pull/30) [`cfe8524`](https://github.com/softistx/nxgt-janus/commit/cfe8524656fecbc21ec52f7f3a2703ed17f92bbb) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A permission's rules no longer offer or accept the permission's own name: `view: ['view']` was completed by your editor, compiled, and failed when `defineModel` ran. It is now a compile error, and a rule still names any other permission of the same type.

- [#33](https://github.com/softistx/nxgt-janus/pull/33) [`4d9ed5f`](https://github.com/softistx/nxgt-janus/commit/4d9ed5f2045efa4f6b0bd2ef09082f3f885eace1) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A key other than `relations` and `permissions` on an object type of `defineModel` — `permission:`, singular — is a compile error. It compiled, and was refused only when `defineModel` ran.

## 0.1.2

### Patch Changes

- [#28](https://github.com/softistx/nxgt-janus/pull/28) [`319c940`](https://github.com/softistx/nxgt-janus/commit/319c9404d2196a8e10ced64439d161a78b0ddd0f) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `defineModel` is completed by your editor: subject types and subject sets in a relation, subject types in `fromField`, and relations, permissions and arrows in a rule and in `when`. A wrong name is still refused, and the error now lists the names it could have been — with "Did you mean" when one is close. `ModelTypesOf` is exported, as the type of what a model's `types` may hold.

## 0.1.1

### Patch Changes

- [#24](https://github.com/softistx/nxgt-janus/pull/24) [`2f6f326`](https://github.com/softistx/nxgt-janus/commit/2f6f326c458665418e8ed4597c33eab5192be7e6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Identities and permissions are each usable alone, and it is now measured:
  importing `@nxgt/janus/permissions` loads no identity code, and importing
  `@nxgt/janus` loads no permission engine. The README opens with the three ways
  to use the package — identities only, permissions only, both — and the guides
  share one vocabulary, defined in `docs/guide/vocabulary.md`.
  
  Two messages now use those words: `janus: pass either user (one user type) or
  users (several user types), …`, and `defineModel: subjects must be an array of
  subject type names — auth.types from janus(), or your own`, which no longer
  suggests that permissions need `janus()`.

## 0.1.0

### Minor Changes

- [#22](https://github.com/softistx/nxgt-janus/pull/22) [`e14809e`](https://github.com/softistx/nxgt-janus/commit/e14809e2737934c73a21b2dd33dd667bc73df564) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first public release.
