---
'@nxgt/janus': patch
---

`janus()` now warns (`process.emitWarning`, code `JANUS_THROTTLE_WINDOW`), once per call, when a `tokens.*` lifetime is shorter than `mail.throttle.window`: the last link or code sent can then expire before the refusal ends. The message names each flow, both durations and the fix.
