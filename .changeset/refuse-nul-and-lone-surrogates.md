---
"@nxgt/janus": patch
---

A NUL character or a lone surrogate in a user's fields is refused with `USER_INVALID` on every adapter, instead of reaching PostgreSQL and answering `STORE_FAILED` — a 503 for a database that is up. A login holding one is nobody's: `signIn` answers `CREDENTIALS_INVALID`, `findByLogin` and `resetPassword.request` answer `null`, and no store is asked. The conformance suite gains `users.edgeCharacters`: every other character, control characters and surrogate pairs included, must round-trip.
