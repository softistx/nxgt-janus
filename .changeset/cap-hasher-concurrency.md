---
"@nxgt/janus": patch
---

`scryptHasher()` and `bunHasher()` now cap how many hashes and verifies run at once. A burst of failed sign-ins used to allocate about 128 MiB (scrypt) or 64 MiB (argon2id) per call with no bound, enough to take an API to gigabytes of memory. The cap is `{ concurrency }`, an integer from 1 to 64, defaulting to 2 for `scryptHasher()` and 4 for `bunHasher()` (about 256 MiB per hasher instance; a `hasher` and the `verifiers` beside it each have their own cap); calls past it wait their turn. Hash formats, parameters and `needsRehash` are unchanged.
