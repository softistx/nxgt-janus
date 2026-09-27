---
"@nxgt/janus": patch
---

Permissions: `list()` through a `fromField` with no `lookup` now names the subject's type in its `TypeError` — `…has no lookup to find the records naming a staff — …` — never the subject's id: a message reports a shape, never a value.
