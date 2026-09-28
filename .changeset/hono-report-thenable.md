---
'@nxgt/janus-hono': patch
---

`janusErrors({ report })` now warns when `report` answers a promise-like that is not a native `Promise` and rejects — a logger's own thenable — as it already did for a native promise; the 503 is sent all the same.
