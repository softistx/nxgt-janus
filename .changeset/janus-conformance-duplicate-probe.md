---
"@nxgt/janus": patch
---

Conformance: a suite run from the published package now recognises two copies of `@nxgt/janus` — `the error is named StoreFailure but is not @nxgt/janus's StoreFailure: two copies of @nxgt/janus are installed …` — instead of answering `expected StoreFailure2, got StoreFailure`. The bundler renames the class in `dist`, and the probe compared against that renamed name.
