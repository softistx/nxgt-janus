---
'@nxgt/janus-mongo': minor
---

Recovery codes on a second factor, for `@nxgt/janus` 0.10. A user's `secondFactor` keeps `recoveryCodes`, the codes' keyed hashes, in order. The field is optional in the collection's schema, and a factor written before it existed reads as having none, `[]`: no document is rewritten.

**Run the sync before deploying.** The validator the previous `syncMongoStores(db)` wrote refuses the new field: until the sync has run, every write of a second factor — `enroll`, `activate`, a confirmed code — fails with `STORE_FAILED`, caused by `Document failed validation`. The new validator still accepts what the previous version writes.

**Finish the rollout before users hold codes.** An instance still on 0.4 reads a factor without its `recoveryCodes`, and writes it back whole when it accepts a code: a user who signs in there loses the recovery codes an instance of 0.5 gave them. Run the two side by side only while no user has been given codes, which `@nxgt/janus` does from `secondFactor.activate` on.
