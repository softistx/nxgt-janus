---
'@nxgt/janus': minor
---

`collectExpired()` now collects lapsed one-time tokens as well as lapsed sessions, and answers how many in all. It runs whichever of `sessions.deleteExpiredSessions` and the new optional `tokens.deleteExpiredTokens` the stores implement, and rejects with `UNSUPPORTED` only when neither does. The tokens include the sign-in and mail throttles' counts, which a database with no TTL kept for ever. A token is deleted once its `expiresAt` is at or before now, spent or not; one that has not lapsed is never deleted, so a throttle keeps counting and a link still redeems until its time is up.

For an adapter author: `deleteExpiredTokens(before)` is optional on `TokenStore`, and a store with its own expiry (a TTL index, a key TTL) leaves it out. `createMemoryStores()` implements it, `assertStores` reports `collectExpiredTokens`, and the conformance suite gains `tokens.deleteExpired` and `outage.deleteExpiredTokens`, skipped with their reason for a store without the method.

For an application: once a lapsed token is collected, its link answers `TOKEN_UNKNOWN` instead of `TOKEN_EXPIRED` or `TOKEN_SPENT`. A custom tokens store needs `deleteExpiredTokens` for `collectExpired()` to reach it.
