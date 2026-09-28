# @nxgt/janus-hono

## 0.4.1

### Patch Changes

- [#165](https://github.com/softistx/nxgt-janus/pull/165) [`3e21695`](https://github.com/softistx/nxgt-janus/commit/3e2169510f2c056f8801470625144aff0d622a2d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `janusErrors({ report })` now warns when `report` answers a promise-like that is not a native `Promise` and rejects — a logger's own thenable — as it already did for a native promise; the 503 is sent all the same.

- [#164](https://github.com/softistx/nxgt-janus/pull/164) [`1007c85`](https://github.com/softistx/nxgt-janus/commit/1007c857fd445620dedb05a59001a7161b0a833c) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the sign-in route (the routes guide of `@nxgt/janus-hono`) and a sign-in mutation (the errors guide of `@nxgt/janus-graphql`) say to rate-limit password guesses per login and per client, with an example — `@nxgt/janus` counts no failed password.
- Updated dependencies [[`fac44ba`](https://github.com/softistx/nxgt-janus/commit/fac44baa935d90c451d05b942c8158606da2f1b2)]:
  - @nxgt/janus@0.13.0

## 0.4.0

### Minor Changes

- [#158](https://github.com/softistx/nxgt-janus/pull/158) [`f8d73c6`](https://github.com/softistx/nxgt-janus/commit/f8d73c6c631eeaf2b4910771f73e43c0ad95e690) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `fresh(maxAge, { clock? })`: a middleware, behind `session(auth)`, that lets a route run only for a session that proved who it is less than `maxAge` ago — signed in, or confirmed since by `auth.stepUp.confirm`. An older one throws `STEP_UP_REQUIRED`, which `janusErrors()` answers 403 with `{ code: 'STEP_UP_REQUIRED' }`; an anonymous request is answered 401. A `maxAge` that is not a duration is a `TypeError` when the app is wired. Needs `@nxgt/janus` 0.12.

### Patch Changes

- Updated dependencies [[`87852d5`](https://github.com/softistx/nxgt-janus/commit/87852d5652adcc9a980d9a5f700d27defadffcd7), [`1c7d59e`](https://github.com/softistx/nxgt-janus/commit/1c7d59eb7e74ee6e10c662af90fbd097a4132199)]:
  - @nxgt/janus@0.12.0

## 0.3.6

### Patch Changes

- [#151](https://github.com/softistx/nxgt-janus/pull/151) [`f5b69f7`](https://github.com/softistx/nxgt-janus/commit/f5b69f7dffc529736727331e6ef66c61dc7f309e) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the README's API table names the six exported types it left out — `JanusErrorsOptions`, `Bindable`, `Bound`, `BoundAuth`, `BoundSession` and `BoundPermission` — and the README and the routes guide show typing a wrapper around `janusErrors()` and passing a `bindJanus()` result to a module of routes.
- Updated dependencies [[`9e4bbf5`](https://github.com/softistx/nxgt-janus/commit/9e4bbf53891d98be7291f2e7589a5451903bfa73)]:
  - @nxgt/janus@0.11.0

## 0.3.5

### Patch Changes

- [#147](https://github.com/softistx/nxgt-janus/pull/147) [`420936d`](https://github.com/softistx/nxgt-janus/commit/420936d0511fe8e36f26ec7ce0b99f0a8dfef774) Thanks [@SteveGT96](https://github.com/SteveGT96)! - `statusOf(code)` now answers `@nxgt/janus`'s own `statusOf`, still typed as Hono's `ContentfulStatusCode`, instead of a copy of the table. Every code answers the status it answered before.

- [#146](https://github.com/softistx/nxgt-janus/pull/146) [`170332b`](https://github.com/softistx/nxgt-janus/commit/170332bb054a1ac411d404473cae5863c8a12f60) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the routes guide shows the recovery codes of `@nxgt/janus` 0.10 — the activation route answering the codes once, a route regenerating them on a fresh code from the app, and a sign-in route redeeming the challenge with a recovery code, which `janusErrors()` answers as `confirm`'s, plus `VERSION_CONFLICT` (409) for a code used twice at once.

- [#149](https://github.com/softistx/nxgt-janus/pull/149) [`6909262`](https://github.com/softistx/nxgt-janus/commit/690926259f8452ff500f5cf8065302eda2373e0d) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Docs: the regenerate route needs no limiter of its own any more — `@nxgt/janus` counts five attempts per user per 15-minute window, and `janusErrors()` answers a wrong code `401 {"code":"CODE_INVALID","attemptsLeft":<n>}`, with `attemptsLeft: 0` once the window is spent.
- Updated dependencies [[`af8bf10`](https://github.com/softistx/nxgt-janus/commit/af8bf104d671f17a843d672ae86ae9ddad2559fb), [`7a419b9`](https://github.com/softistx/nxgt-janus/commit/7a419b9989de593b354dbf1ffdf6791202be6c0b), [`0789c39`](https://github.com/softistx/nxgt-janus/commit/0789c39bcc86f0b14738032020254b2d9465da0f), [`c9bcfe0`](https://github.com/softistx/nxgt-janus/commit/c9bcfe0ff6eff1347f6116a773be2df9d3893fa6)]:
  - @nxgt/janus@0.10.0

## 0.3.4

### Patch Changes

- Updated dependencies [[`0be654f`](https://github.com/softistx/nxgt-janus/commit/0be654f2fb2d02186cf68cab070d59b8b039d129)]:
  - @nxgt/janus@0.9.0

## 0.3.3

### Patch Changes

- Updated dependencies [[`206c2f0`](https://github.com/softistx/nxgt-janus/commit/206c2f0a2c496b964199a9f3cce5fb9d379cb1a2)]:
  - @nxgt/janus@0.8.0

## 0.3.2

### Patch Changes

- Updated dependencies [[`9061454`](https://github.com/softistx/nxgt-janus/commit/9061454e31b6a96097bf44467f99e67c32c86c0f)]:
  - @nxgt/janus@0.7.0

## 0.3.1

### Patch Changes

- [#64](https://github.com/softistx/nxgt-janus/pull/64) [`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579) Thanks [@SteveGT96](https://github.com/SteveGT96)! - Sign in with a code sent by e-mail, with no password needed.
  
  - `auth.<type>.signInCode.request(email)` answers `{ code, challenge, email, expiresAt, user }`. It answers `null` when nobody holds that e-mail or the user is inactive, and never says which. Send `code` by e-mail, and keep `challenge` with the visitor.
  - `auth.<type>.signInCode.confirm(challenge, code)` checks the code, marks the e-mail verified and signs the user in. A user with an active second factor is still asked for it.
  - The code is six digits and lives ten minutes (`tokens.signInCode`). It takes five attempts, counted by the store before the code is compared. Only its hash is stored, keyed by the challenge.
  - **Rate-limit `request` per e-mail and per client.** Every call issues a new challenge with five attempts of its own, so the attempts bound one challenge, not one account.
  - It exists on every user type with an e-mail, including one without a password.
  - **janus-telemetry:** a new `janus.signInCode.sent` event. A sign-in by code is a `janus.signIn` event with `janus.signIn.code: true`, and a refused code is a `janus.signIn.refused` warning, marked the same way. Neither the code nor the challenge is ever written.
  - **janus-hono:** the routes guide shows a sign-in by code.
- Updated dependencies [[`6e06d6f`](https://github.com/softistx/nxgt-janus/commit/6e06d6f918044454f1ea8144b1909c1be57e7579)]:
  - @nxgt/janus@0.6.0

## 0.3.0

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

## 0.2.2

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

- Updated dependencies [[`db8bcaf`](https://github.com/softistx/nxgt-janus/commit/db8bcafb4284fda9a6609207658e17f80c16a5aa), [`67106ed`](https://github.com/softistx/nxgt-janus/commit/67106ed205eaa8725e18b08f928288ff03d867a0), [`579ff03`](https://github.com/softistx/nxgt-janus/commit/579ff03d84809d7f1e1bf8f4c32ce5fe76b0aa9a), [`506075f`](https://github.com/softistx/nxgt-janus/commit/506075ff9eb11f7bb49bcde5cfd5dfe2ddf11e5d)]:
  - @nxgt/janus@0.2.0

## 0.1.0

### Minor Changes

- [#38](https://github.com/softistx/nxgt-janus/pull/38) [`9f75a58`](https://github.com/softistx/nxgt-janus/commit/9f75a58767ed5d6a1b7eaeee6f0b732c5c287a19) Thanks [@SteveGT96](https://github.com/SteveGT96)! - The first release: `@nxgt/janus` in a Hono app. `session()` sets the signed-in user on every request and sends a renewed cookie again; `sendSession` and `signOut` set and clear the cookie; `permission()` guards a route with a permission of the model and hands it the loaded object, with `byParam` as its loader; `provide()` puts the instances on the context; `janusErrors()` answers every error with its status — an outage as 503, never 401 or 403; `bindJanus()` binds them all to the instances once.

### Patch Changes

- Updated dependencies [[`fe5bbfd`](https://github.com/softistx/nxgt-janus/commit/fe5bbfd26bad216941d8743541f579ea485d81b1), [`cfe8524`](https://github.com/softistx/nxgt-janus/commit/cfe8524656fecbc21ec52f7f3a2703ed17f92bbb), [`4d9ed5f`](https://github.com/softistx/nxgt-janus/commit/4d9ed5f2045efa4f6b0bd2ef09082f3f885eace1)]:
  - @nxgt/janus@0.1.3
