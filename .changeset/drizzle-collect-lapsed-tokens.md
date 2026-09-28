---
'@nxgt/janus-drizzle': patch
---

Docs: the `collectExpired()` trap says lapsed tokens stay in `tokens` too — `@nxgt/janus`'s sign-in throttle adds a row per login tried and per window — and gives the `delete` to schedule beside it.
