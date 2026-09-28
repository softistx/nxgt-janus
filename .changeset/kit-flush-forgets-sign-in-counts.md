---
'@nxgt/janus-kit': patch
---

Docs: the configuration guide's `redis` section says a flushed Redis forgets `@nxgt/janus`'s sign-in counts, and that without Redis, on PostgreSQL, lapsed tokens need a scheduled delete beside `collectExpired()`.
