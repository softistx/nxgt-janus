---
"@nxgt/janus-telemetry": patch
---

Trace `signUp.prepare` and its `send()` like the other prepared requests (`janus.signUp` is written when the account is created), keep `signUp` callable once traced, log `janus.mail.throttled` for `signUp.prepare` and `verifyEmail.prepare`, and classify the new `EMAIL_UNVERIFIED` code as a refusal. Needs `@nxgt/janus` with `EMAIL_UNVERIFIED`.
