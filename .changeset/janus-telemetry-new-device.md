---
"@nxgt/janus-telemetry": minor
---

A sign-in from a new device is marked: the `janus.signIn` log carries `janus.signIn.newDevice: true` when the answer's `newDevice` is — from `signIn`, `signInCode.confirm`, `magicLink.confirm`, `secondFactor.confirm` and `secondFactor.recover`. The device token is never written.
