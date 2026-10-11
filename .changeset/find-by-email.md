---
'@nxgt/janus': minor
---

`auth.<type>.findByEmail(email)` answers the user of the type holding the address, or `null`, on every type with an e-mail — a type with no password included, which has no `findByLogin`. The address is normalised and compared as the e-mail flows do, whatever the type's login; a value that is no address (not a string, empty once trimmed, or holding a NUL or a lone surrogate) is nobody's, without asking the store; an outage is `STORE_FAILED`. It counts nothing in the mail or the sign-in throttle, issues nothing and writes nothing: the lookup an invitation needs before `signInProven`. Server-side only — it tells whether an account exists. `FindByEmailApi` is exported.
