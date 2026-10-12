---
'@nxgt/janus-mongo': minor
---

The `kind` enum of the `tokens` validator admits `changeEmail`, the token kind of `@nxgt/janus`'s change of e-mail. **A sync is required**: run `syncMongoStores(db)` before deploying. Until it has run, the first write of a `changeEmail` token fails with `STORE_FAILED`, caused by `Document failed validation`; no document is rewritten.
