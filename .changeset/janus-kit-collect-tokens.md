---
'@nxgt/janus-kit': patch
---

Documentation only: on PostgreSQL, `kit.auth.collectExpired()` now deletes lapsed tokens, the throttles' counts included, beside lapsed sessions, so the hand-written `delete from tokens` the configuration guide advised is no longer needed. Upgrade `@nxgt/janus-drizzle` to 0.9 and `@nxgt/janus` to 0.25 for it.
