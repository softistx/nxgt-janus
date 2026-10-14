---
'@nxgt/janus': minor
---

Add `findOrCreate(key, input)` to every user type with a login or an e-mail: it answers `{ user, created }`, finding the holder of the key (the login on a type with a password, the e-mail on one without, normalised as `findByLogin` and `findByEmail` do) or, when nobody holds it, calling `input()` and creating the user exactly as `create` does. `input` may refuse before any write by throwing, and must name the key or the call is `USER_INVALID`; a write that loses a race to another creation reads the key once more and answers the winner with `created: false`, rethrowing `LOGIN_TAKEN` only when nobody is found. It is the accept step of an invitation in one call, server-side only, typed by the new `FindOrCreateApi`.
