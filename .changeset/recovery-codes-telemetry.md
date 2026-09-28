---
'@nxgt/janus-telemetry': minor
---

Recovery codes in the audit trail. A sign-in by `secondFactor.recover` is a `janus.signIn` with `janus.signIn.recoveryCode: true` and `janus.secondFactor.recoveryCodesLeft`, a count and never a code; its refusals are `janus.signIn.refused` with the same mark. `regenerateRecoveryCodes` writes `janus.secondFactor.recoveryCodesRegenerated` with the `user.id` it was called for. No recovery code reaches a span or an event.
