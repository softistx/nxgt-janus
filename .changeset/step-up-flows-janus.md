---
'@nxgt/janus': minor
---

A step-up: a signed-in user proves again who they are before a sensitive action — changing the e-mail, disabling the second factor, deleting the account.

- `stepUp.request(user)`, on every user type with an e-mail, issues a challenge: with a six-digit code to e-mail (`via: 'email'`), or — for a user whose second factor is active — to confirm with a code from their app (`via: 'secondFactor'`), so a step-up is never weaker than the sign-in the account asks for. One step-up is live per user; a challenge lives `'10m'`, `tokens.stepUp` in `janus()`'s configuration.
- `stepUp.confirm(request, challenge, code)` checks the code and moves `authenticatedAt` of the session the request presents to now, answering that session. It opens no session. Five attempts per challenge; an app's codes are also counted per user, five per 15-minute window, in the count `regenerateRecoveryCodes` keeps.
- `assertFresh(session, maxAge, clock?)` refuses a session that proved who it is `maxAge` ago or more with `StepUpRequiredError`, a new exported class.
- **Breaking for an exhaustive `switch`: `JanusErrorCode` gains `'STEP_UP_REQUIRED'`**, which `statusOf` answers 403.
- `session.authenticatedAt` is when the session last proved who it is — at the sign-in, or since by a step-up — no longer only when it was opened.
- A step-up whose session is signed out while the code is checked is `TOKEN_UNKNOWN`, `stepUp.confirm: the session was signed out while the code was checked` — the session is never brought back.
