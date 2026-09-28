---
'@nxgt/janus-telemetry': minor
---

A step-up is written: `janus.stepUp.asked` (info, with `janus.stepUp.via` — `email` or `secondFactor`), `janus.stepUp.confirmed` (info) and `janus.stepUp.refused` (**warn**, with `janus.refusal` and, for `CODE_INVALID`, `janus.secondFactor.attemptsLeft`), each with the `user.id` — never the code nor the challenge. The `stepUp.confirm` span names the session's user, not the session's id. `STEP_UP_REQUIRED`, from `assertFresh`, is a refusal: the span stays `ok`.
