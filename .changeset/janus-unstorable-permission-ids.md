---
"@nxgt/janus": patch
---

Permissions: an object or subject id holding a NUL character or a lone surrogate — which no store can keep — is held by nobody. `can()` answers `false` and `list()` an empty page for one before any store call, a `fromField` whose value holds one names nobody, and `grant()` and `revoke()` refuse one with a `TypeError` instead of reaching the store, where PostgreSQL alone failed with `STORE_FAILED`. The relation store conformance suite adds `relations.edgeCharacters`: every other character in an id round-trips.
