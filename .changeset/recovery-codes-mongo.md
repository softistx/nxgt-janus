---
'@nxgt/janus-mongo': minor
---

Recovery codes on a second factor, for `@nxgt/janus` 0.10. A user's `secondFactor` keeps `recoveryCodes`, the codes' keyed hashes, in order. The field is optional in the collection's schema, and a factor written before it existed reads as having none, `[]`: no document is rewritten.

**Run the sync before deploying.** The validator the previous `syncMongoStores(db)` wrote refuses the new field: until the sync has run, every write of a second factor — `enroll`, `activate`, a confirmed code — fails with `STORE_FAILED`, caused by `Document failed validation`. The new validator still accepts what the previous version writes, so a rolling deployment is safe once it has run.
