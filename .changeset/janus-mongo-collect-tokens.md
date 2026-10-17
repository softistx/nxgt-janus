---
'@nxgt/janus-mongo': patch
---

Documentation only: the TTL indexes drop lapsed tokens as well as sessions, so `deleteExpiredTokens` is deliberately not implemented either, and `auth.collectExpired()` still answers `UNSUPPORTED` with this adapter. The `createMongoStores` JSDoc named `sessions.collectExpired()`, which does not exist.
