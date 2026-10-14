---
'@nxgt/janus-telemetry': patch
---

Document that `janus.<type>.findOrCreate` is traced like `findByEmail`: the span carries the user type and never the key.
