# @nxgt/janus-hono

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
