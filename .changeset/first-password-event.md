---
"@nxgt/janus": minor
---

`user.passwordChanged` carries `first: boolean`: `true` when the user had no password before (`setPassword` on an account created without a credential), `false` for a change and for a first proof that dropped a password. A listener that sends a "your password was changed" notice skips it when `first` is `true` (fixes #280).
