---
"@nxgt/janus": patch
---

A NUL character or a lone surrogate in a user's fields is refused with `USER_INVALID` on every adapter, instead of reaching PostgreSQL and answering `STORE_FAILED` — a 503 for a database that is up. So is a login your own `password.normalize` function turns into one. A login holding one is nobody's: `signIn` answers `CREDENTIALS_INVALID`, `findByLogin` and `resetPassword.request` answer `null`, and no store is asked. `signOutEverywhere` reads an `except` that is no session id as none. A schema issue's path stops before a key holding one, so it never reaches a message. The conformance suite gains `users.edgeCharacters`: every other character, control characters and surrogate pairs included, must round-trip.

A user MongoDB or the memory store already holds with such a character now gets `USER_INVALID` on any `update`, since the merged fields are validated whole: clean the field first.
