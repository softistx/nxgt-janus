---
'@nxgt/janus-telemetry': minor
---

`changeEmail.confirm` writes `janus.email.changed`, an info event with `janus.user.type`, the `user.id` of the user who moved to a new address and `janus.email.proved: true` — never the former or the new address, and no `janus.email.verified` besides, since the move is the proof. `update` writes the same event with `janus.email.proved: false` when its patch names the `email` field (the default field name; a renamed one is not seen, an `update` that moved the address and then failed with `STORE_FAILED` is not seen either, and a patch that keeps the same address is still written). `changeEmail.send` is counted by the mail throttle like the other e-mail requests: past its attempts it writes `janus.mail.throttled` with `janus.mail.flow: changeEmail.send` and the `user.id`. Needs the `@nxgt/janus` that ships `changeEmail`.
