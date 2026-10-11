---
'@nxgt/janus-telemetry': patch
---

The README names `janus.<type>.findByEmail` among the traced reads: its span carries the `user.id` it found, never the address asked for.
