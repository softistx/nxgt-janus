---
"@nxgt/janus-telemetry": patch
---

Trace `signUp.prepare` and its `send()` like the other prepared requests, keep `signUp` callable once traced, log `janus.mail.throttled` for `signUp.prepare` and `verifyEmail.prepare`, and classify the new `EMAIL_UNVERIFIED` code as a refusal.
