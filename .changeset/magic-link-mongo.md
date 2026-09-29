---
'@nxgt/janus-mongo': minor
---

Admits the token kind `magicLink`, `@nxgt/janus` 0.15's sign-in link.

**Run `syncMongoAdapter(db)` or `syncMongoStores(db)` before deploying.** The `kind` enum the previous sync wrote refuses `magicLink`, so `magicLink.request` fails with `STORE_FAILED` (`Document failed validation`) until it runs. No document is rewritten.
