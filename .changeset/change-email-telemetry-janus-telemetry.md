---
'@nxgt/janus-telemetry': minor
---

`changeEmail.confirm` writes `janus.email.changed`, an info event with `janus.user.type` and the `user.id` of the user who moved to a new address — never the former or the new address, and no `janus.email.verified` besides, since the move is the proof. `changeEmail.send` is counted by the mail throttle like the other e-mail requests: past its attempts it writes `janus.mail.throttled` with `janus.mail.flow: changeEmail.send` and the `user.id`. Needs the `@nxgt/janus` that ships `changeEmail`.
