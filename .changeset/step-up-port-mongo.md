---
'@nxgt/janus-mongo': minor
---

Implements `SessionStore.reauthenticateSession` — one `findOneAndUpdate` filtered on `revokedAt: null` — and admits the token kind `stepUp`.

**Run `syncMongoAdapter(db)` or `syncMongoStores(db)` before deploying.** The `kind` enum the previous sync wrote refuses `stepUp`, so a step-up request fails with `STORE_FAILED` (`Document failed validation`) until it runs. No document is rewritten.
