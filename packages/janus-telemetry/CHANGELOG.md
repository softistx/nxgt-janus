# @nxgt/janus-telemetry

## 0.13.1

### Patch Changes

- Updated dependencies [[`edabeb3`](https://github.com/softistx/nxgt-janus/commit/edabeb310e1e944c0f555979d5f119302f35618b)]:
  - @nxgt/janus@0.25.0

## 0.13.0

### Minor Changes

- [#231](https://github.com/softistx/nxgt-janus/pull/231) [`fbe8303`](https://github.com/softistx/nxgt-janus/commit/fbe8303c20d780406e84643e96e9c0845de1ab67) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `instrumentPermissions` traces `replace` like `grant` and `revoke`: a `janus.replace` span carrying the object and `janus.relation`, and one `janus.tuple.granted` audit event per tuple it added and one `janus.tuple.revoked` per tuple it removed, with the attributes `grant` and `revoke` write (a subject set also carries `janus.subject.relation`). Nothing is written when `replace` changes nothing or fails. `PermissionsLike` gains an optional `replace`. Also documents that `janus.<type>.findOrCreate` is traced like `findByEmail`: the span carries the user type and never the key.

### Patch Changes

- Updated dependencies [[`7e3bfc8`](https://github.com/softistx/nxgt-janus/commit/7e3bfc837dc8586a41f7630dc98fd48ee199622f), [`04f378c`](https://github.com/softistx/nxgt-janus/commit/04f378c37a55d6b6c9609aab4394e749c6950be2), [`311c80d`](https://github.com/softistx/nxgt-janus/commit/311c80db5875e9e878dfff946b71deac6bf58b16)]:
  - @nxgt/janus@0.24.0

## 0.12.0

### Minor Changes

- [#220](https://github.com/softistx/nxgt-janus/pull/220) [`9e12709`](https://github.com/softistx/nxgt-janus/commit/9e127095d5e1c59e9030200c120ef82bbffe2186) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `changeEmail.confirm` writes `janus.email.changed`, an info event with `janus.user.type`, the `user.id` of the user who moved to a new address and `janus.email.proved: true` — never the former or the new address, and no `janus.email.verified` besides, since the move is the proof. `update` writes the same event with `janus.email.proved: false` when its patch names the `email` field (the default field name; a renamed one is not seen, an `update` that moved the address and then failed with `STORE_FAILED` is not seen either, and a patch that keeps the same address is still written). `changeEmail.send` is counted by the mail throttle like the other e-mail requests: past its attempts it writes `janus.mail.throttled` with `janus.mail.flow: changeEmail.send` and the `user.id`. Needs the `@nxgt/janus` that ships `changeEmail`.

### Patch Changes

- Updated dependencies [[`349664c`](https://github.com/softistx/nxgt-janus/commit/349664c16b994a4957ad2e37580b67fd0f2cb22d), [`edbd4f3`](https://github.com/softistx/nxgt-janus/commit/edbd4f3b5a2faed9e2ee8a59ead8910b4b9031ff)]:
  - @nxgt/janus@0.23.0

## 0.11.1

### Patch Changes

- [#211](https://github.com/softistx/nxgt-janus/pull/211) [`01867bc`](https://github.com/softistx/nxgt-janus/commit/01867bc438ec82cdcf867ab755a2af72874346bc) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Accept TypeScript 7 as well as 6: the `typescript` peer is `^6.0.3 || ^7.0.0`. The packages use TypeScript for its type-level API only, and the type tests, including every compile-time refusal, pass under 7.0.2.
- Updated dependencies [[`01867bc`](https://github.com/softistx/nxgt-janus/commit/01867bc438ec82cdcf867ab755a2af72874346bc)]:
  - @nxgt/janus@0.22.1

## 0.11.0

### Minor Changes

- [#209](https://github.com/softistx/nxgt-janus/pull/209) [`8d9256d`](https://github.com/softistx/nxgt-janus/commit/8d9256dc52bf0c4dd5d489cad37c469cdd7ba812) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Proving an e-mail on the application's own proof: `auth.<type>.verifyEmail.proveFirst(user)`.** On a user whose e-mail was never proved, it applies exactly what `magicLink.confirm` and `signInCode.confirm` apply to such an e-mail: in one write it marks the e-mail verified and drops the password and the second factor (active or waiting, with its recovery codes); it revokes every session and spends the reset links and second-factor challenges, before the write and after it; and it sends `user.emailVerified`, then `user.passwordChanged` and `user.secondFactorDisabled` when it dropped them. It answers `{ user, proved: true }`. On an e-mail already proved it does nothing and answers `{ user, proved: false }`. It sends no e-mail, issues no token and counts in neither throttle. An inactive user is `USER_INACTIVE`; a malformed, unknown or other-type id is `NOT_FOUND`, as for `signInProven`; a user written between its read and its write is `VERSION_CONFLICT`; an outage is `STORE_FAILED`. On every type with an e-mail.
  
  `signInProven` proves no e-mail, so an invitation accepted with it alone left a password or a second factor that somebody who signed up with the invited address had set. **Accept an invitation in this order**: `findByEmail` (or `create`), `verifyEmail.proveFirst`, `setPassword` on a type with a password, then `signInProven` — `proveFirst` drops the password and revokes every session, so after `setPassword` it erases the new password, and after `signInProven` it revokes the new session. **Privileged**: call it only after your server verified its own proof of the inbox, on the user that proof names — never with an id a request supplied. `@nxgt/janus`: new type `FirstProof<U>`; three new compile-time refusals (169 in all).
  
  `@nxgt/janus-telemetry`: `verifyEmail.proveFirst` is traced as `janus.<type>.verifyEmail.proveFirst` with the `user.id` it proved, and writes `janus.email.verified` marked `janus.email.proveFirst: true` when it proved — never the address. Needs `@nxgt/janus` 0.22 for the new flow.

### Patch Changes

- Updated dependencies [[`8d9256d`](https://github.com/softistx/nxgt-janus/commit/8d9256dc52bf0c4dd5d489cad37c469cdd7ba812)]:
  - @nxgt/janus@0.22.0

## 0.10.1

### Patch Changes

- [#207](https://github.com/softistx/nxgt-janus/pull/207) [`7eed42d`](https://github.com/softistx/nxgt-janus/commit/7eed42dc4c59501810cfbbd49bf7483ebbbad7e6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The README names `janus.<type>.findByEmail` among the traced reads: its span carries the `user.id` it found, never the address asked for.
- Updated dependencies [[`d450195`](https://github.com/softistx/nxgt-janus/commit/d450195141da06ffb138dd74159ee2865bdd7369)]:
  - @nxgt/janus@0.21.0

## 0.10.0

### Minor Changes

- [#204](https://github.com/softistx/nxgt-janus/pull/204) [`e064597`](https://github.com/softistx/nxgt-janus/commit/e0645973a37b64ddd47aa4540fd195172888f9b6) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **E-mail requests in two steps: `prepare`, then `send()`.** `magicLink.prepare(email)`, `signInCode.prepare(email)` and `resetPassword.prepare(email)` validate the input as `request` does, normalise the address and count it against the mail throttle — `MailThrottledError` (`MAIL_THROTTLED`, `retryAfter`) past the limit — and **look nobody up**: the same store calls for any address, none with `mail: { throttle: false }`. `send()` on the answer does the rest of `request` — the lookup, the token issued, the earlier ones spent — and answers what `request` answers, `null` for nobody, **without counting again**. It runs once: a second call, or one after a `send()` that failed, is a `TypeError` (`magicLink.prepare(…).send: already called — a prepared request sends once; call magicLink.prepare again for another`), so each `prepare` permits exactly one issue and nothing a caller passes skips the count. An application that runs `request` in the background, so its time does not tell an account from nobody, can now answer `MAIL_THROTTLED` in the visitor's request and send in the background.
  
  `@nxgt/janus`: `signInCode.prepare` also answers the `challenge`, minted before the lookup, so the visitor's cookie is set whoever holds the address and no decoy is needed; `send()` issues the code under it. New types `PreparedRequest<Issued>` (`{ send() }`, for a link and a reset) and `PreparedCode<U>` (`{ challenge, send() }`). `request(email)` is unchanged; it is now `prepare`, then `send()`. `verifyEmail.send` and `stepUp.request` have no `prepare`: they are counted per user, for a user the application already holds, so their time tells nothing about who has an account. Five new compile-time refusals (160 in all).
  
  `@nxgt/janus-telemetry`: `prepare` is traced like any flow and writes `janus.mail.throttled` (`janus.mail.flow: magicLink.prepare`) past its limit; the `send()` of what it answers is traced as `janus.<type>.magicLink.prepare.send` and writes `janus.magicLink.sent` or `janus.signInCode.sent`, as `request` does. Needs `@nxgt/janus` 0.20 for the new flows.
  
  `@nxgt/janus-hono` and `@nxgt/janus-graphql`: docs only — the routes guide's code, link and reset routes, and the errors guide's mutation, use `prepare` in the request and `send()` after the answer.

- [#206](https://github.com/softistx/nxgt-janus/pull/206) [`9629708`](https://github.com/softistx/nxgt-janus/commit/962970815238b4e6684256c9e891b2e662d76b68) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Signing in on the application's own proof: `auth.<type>.signInProven(user, { device? })`.** For a user the application proved by its own means — an invitation token it issued and the person followed, a channel of its own — with no password, code or link. It finishes as every sign-in does and answers the same `SignedIn | SecondFactorRequired` union: an active second factor answers a challenge for `secondFactor.confirm`, a `device` answers `newDevice` and `deviceToken` and sends `user.newDeviceSignedIn` for a new one, and an inactive user is `USER_INACTIVE`. A malformed id, an unknown one, a deleted user or a user of another type is `NOT_FOUND`, as for `get`. It sends no e-mail, issues no token, counts in neither the mail nor the sign-in throttle, and spends nothing: links and codes already sent still work. It proves no e-mail.
  
  **Privileged**: janus checks no credential, so call it only after your server verified its proof, with the id from that proof's record — never with an id a request supplied. It replaces `magicLink.request` + `confirm` for accepting an invitation, which since 0.18 counted against the mail throttle per address: five anonymous requests for the invitee's address made the acceptance answer 429. `@nxgt/janus`: new type `ProvenSignInApi<U, Answer>`, on every user type; three new compile-time refusals (163 in all).
  
  `@nxgt/janus-telemetry`: `signInProven` is traced as `janus.<type>.signInProven` with `janus.signIn.status`, and writes `janus.signIn`, `janus.signIn.refused` or `janus.signIn.secondFactor` like the other sign-ins, marked `janus.signIn.proven: true`. Needs `@nxgt/janus` 0.20 for the new flow.

### Patch Changes

- Updated dependencies [[`e064597`](https://github.com/softistx/nxgt-janus/commit/e0645973a37b64ddd47aa4540fd195172888f9b6), [`9629708`](https://github.com/softistx/nxgt-janus/commit/962970815238b4e6684256c9e891b2e662d76b68)]:
  - @nxgt/janus@0.20.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`3a4ecaa`](https://github.com/softistx/nxgt-janus/commit/3a4ecaada09a5063c9c803bab383f9c8d2fcb5e3)]:
  - @nxgt/janus@0.19.0

## 0.9.0

### Minor Changes

- [#198](https://github.com/softistx/nxgt-janus/pull/198) [`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232) Thanks [@SteveGT96](https://github.com/SteveGT96)! - **Behaviour change — the requests that hand out something to e-mail are now throttled, on by default.** Past five requests of one flow in a 10-minute window, `magicLink.request`, `signInCode.request` and `resetPassword.request` — counted **per address**, normalised, whatever the user type — and `verifyEmail.send` and a `stepUp.request` that e-mails a code — counted **per user** — throw `MailThrottledError`, code `MAIL_THROTTLED` (`statusOf` → 429), with `retryAfter`, the seconds until the next window, and **issue nothing**: no token, code or challenge is minted, and **nothing is spent — the last link or code sent still works**, whoever asked for it, so somebody asking for an address in a loop cannot lock its owner out: the owner's last e-mail confirms. The default window, `'10m'`, is no longer than the shortest default token lifetime (`signInCode` and `stepUp`), so under the default lifetimes the last one sent outlives the refusal; a window longer than a lifetime you set leaves a gap. Each flow counts on its own. An address nobody holds is counted before anything is looked up and refused alike past the limit — under it, it still answers `null` — so being throttled never tells who has an account. A step-up confirmed with the app sends nothing and is not counted. Nothing locks: the next window answers again. The message is `<call>: too many e-mails asked for this address — the last one sent still works; use it, or wait for the next window` (or `… for this user — …`): tell the visitor to use the last e-mail they received. One client asking for many addresses is not counted — janus never sees an IP — so keep a per-client ceiling of your own: `@nxgt/redis` 0.5.0 and later has `defineRateLimit` and `bindRateLimit`, whose `enforce()` throws `GuardError` `RATE_LIMITED` with a `retryAfter` in milliseconds. `janus({ mail: { throttle: { attempts, window } } })` changes the limit, and **`mail: { throttle: false }` turns it off** — a test suite that makes more than five of one request for one address or user over a `fixedClock` needs one or the other. The counts live in the tokens store as `secondFactor` tokens named by a keyed hash of the flow and the address or user — no change for adapters; a flushed or evicting Redis forgets them, and on PostgreSQL they add a row per flow, address and window to the lapsed tokens to delete on a schedule. **A tokens store that cannot count now fails those requests with `STORE_FAILED`** (fail closed), and issues nothing. `JanusErrorCode` gains `MAIL_THROTTLED` and `JanusErrorStatus` gains `429`: a `switch` over either that is exhaustive stops compiling until it handles them. New exports: `MailThrottledError`, `MailConfig`, `MailThrottleConfig`. Five new compile-time refusals (152 in all). `@nxgt/janus-hono`: `bodyOf()` answers `{ code: 'MAIL_THROTTLED', retryAfter }` and `janusErrors()` answers 429 with a `Retry-After` header. `@nxgt/janus-graphql`: `janusGraphQLError()` answers status 429, the message `Too many requests, retry later`, `retryAfter` in `extensions` and a `Retry-After` header in `extensions.http.headers`. `@nxgt/janus-telemetry`: `MAIL_THROTTLED` is a refusal, so its span stays `ok`, and a throttled request writes a `janus.mail.throttled` warning with `janus.mail.flow` and `janus.mail.retryAfter` — never the address.

### Patch Changes

- Updated dependencies [[`62a838f`](https://github.com/softistx/nxgt-janus/commit/62a838fe2bbb25743c556c80e7c3bd4bc8a49232), [`9fd9e98`](https://github.com/softistx/nxgt-janus/commit/9fd9e987226994c551ae49b27277f52eba605f03)]:
  - @nxgt/janus@0.18.0

## 0.8.0

### Minor Changes

- [#181](https://github.com/softistx/nxgt-janus/pull/181) [`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070) Thanks [@SteveGT96](https://github.com/SteveGT96)! - A sign-in from a new device is marked: the `janus.signIn` log carries `janus.signIn.newDevice: true` when the answer's `newDevice` is — from `signIn`, `signInCode.confirm`, `magicLink.confirm`, `secondFactor.confirm` and `secondFactor.recover`. The device token is never written.

### Patch Changes

- Updated dependencies [[`c0a91ca`](https://github.com/softistx/nxgt-janus/commit/c0a91ca63f7baf8285bc6a73f8cad50410531070)]:
  - @nxgt/janus@0.17.0

## 0.7.1

### Patch Changes

- Updated dependencies [[`530e301`](https://github.com/softistx/nxgt-janus/commit/530e301eaf523af0b4f1d637e1990564bde70489), [`fba19d4`](https://github.com/softistx/nxgt-janus/commit/fba19d47836fb4dfbe11df7e5a184284082ac061), [`819c954`](https://github.com/softistx/nxgt-janus/commit/819c95494bdefe372284ef25a630c3f601d7765a)]:
  - @nxgt/janus@0.16.0

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
