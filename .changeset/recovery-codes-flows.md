---
'@nxgt/janus': minor
---

Recovery codes for the TOTP second factor: a user whose phone is gone can still sign in, without an operator resetting the account.

- **`secondFactor.activate` now answers `{ user, recoveryCodes }`**: ten codes, written `xxxxx-xxxxx`, shown once. Only their keyed hashes are stored (HMAC-SHA-256 under a key derived from `secondFactor.keys`, bound to the user's id), so no call answers them again.
- **`secondFactor.recover(challenge, code)`** redeems `signIn`'s challenge with a recovery code instead of the app's code, and answers the session with `recoveryCodesLeft`. The code is spent in one write under the version read: of two sign-ins using the same code at once, one opens a session and the other is `VERSION_CONFLICT`. The challenge's five attempts are shared with `confirm`, and a wrong or used code is `CODE_INVALID` with `attemptsLeft`.
- **`secondFactor.regenerateRecoveryCodes(user, code)`** takes a fresh code from the app, replaces every code, and answers the new ones once. It is `SECOND_FACTOR_NOT_ENROLLED` without an active factor: `secondFactor.regenerateRecoveryCodes: the user has no active second factor — recovery codes come with one`.
- `disable` removes the codes with the factor.
- Two new user events: `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed`, named by id alone like the others.

**Breaking: `activate` answers `{ user, recoveryCodes }`, not the user.** `(await auth.secondFactor.activate(user, code)).hasSecondFactor` no longer compiles (`TS2339 … on type 'RecoveryCodesIssued<…>'`); read `.user`, and show `recoveryCodes` to the user.

**Breaking: `UserEventType` has two more members.** A `switch` that exhausts it no longer compiles until it handles them. Receivers on `@nxgt/janus-webhooks` before 0.4.0 answer `null` for the two new types: upgrade them first, or leave the types out of their endpoint's `types`.

**Keep a sealing key while recovery codes are hashed with it.** A code hashed under a key no longer in `secondFactor.keys` is a bare `TypeError`: `<call>: a recovery code is hashed with the key "<id>", which secondFactor.keys no longer holds — keep a key until no secret or recovery code uses it`. Codes cannot be hashed again under the new key, since only their hashes are kept: regenerate them, or keep the old key.
