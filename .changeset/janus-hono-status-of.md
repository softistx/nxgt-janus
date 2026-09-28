---
'@nxgt/janus-hono': patch
---

`statusOf(code)` now answers `@nxgt/janus`'s own `statusOf`, still typed as Hono's `ContentfulStatusCode`, instead of a copy of the table. Every code answers the status it answered before.
