---
"@nxgt/janus": minor
"@nxgt/janus-telemetry": minor
"@nxgt/janus-hono": patch
---

Sign in with a code sent by e-mail, with no password needed.

- `auth.<type>.signInCode.request(email)` answers `{ code, challenge, email, expiresAt, user }`. It answers `null` when nobody holds that e-mail or the user is inactive, and never says which. Send `code` by e-mail, and keep `challenge` with the visitor.
- `auth.<type>.signInCode.confirm(challenge, code)` checks the code, marks the e-mail verified and signs the user in. A user with an active second factor is still asked for it.
- The code is six digits and lives ten minutes (`tokens.signInCode`). It takes five attempts, counted by the store before the code is compared. Only its hash is stored, keyed by the challenge.
- **Rate-limit `request` per e-mail and per client.** Every call issues a new challenge with five attempts of its own, so the attempts bound one challenge, not one account.
- It exists on every user type with an e-mail, including one without a password.
- **janus-telemetry:** a new `janus.signInCode.sent` event. A sign-in by code is a `janus.signIn` event with `janus.signIn.code: true`, and a refused code is a `janus.signIn.refused` warning. A refused code is marked the same way. Neither the code nor the challenge is ever written.
- **janus-hono:** the routes guide shows a sign-in by code.
