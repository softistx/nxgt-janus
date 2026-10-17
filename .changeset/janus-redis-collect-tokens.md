---
'@nxgt/janus-redis': patch
---

Documentation only: Redis expires every session and token key itself, so `deleteExpiredTokens` is deliberately not implemented beside `deleteExpiredSessions`, and `auth.collectExpired()` still answers `UNSUPPORTED` with this adapter.
