---
"@nxgt/janus": patch
"@nxgt/janus-mongo": patch
---

`LOGIN_TAKEN`: the message no longer quotes the login — `insertUser: the login is taken by another patient` — as a message never carries a value, and an e-mail in a log line is personal data. `error.login` and `error.userType` still name it.

**For adapter authors:** `@nxgt/janus/conformance` now checks that a login conflict's message does not quote the login. An adapter that copied the old wording fails `users` until its message drops the value.
