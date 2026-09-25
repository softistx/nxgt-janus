---
"@nxgt/janus": patch
---

`list()` offers its permission to your editor: it completed nothing, because its reversibility check was intersected with the whole union of names. It now offers the names `list()` can answer — those reaching no `fromField` without a `lookup` — and refuses the others with the same message.
