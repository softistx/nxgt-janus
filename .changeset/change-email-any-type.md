---
'@nxgt/janus': minor
---

An instance with several user types now answers `changeEmail.confirm(token)` at its root, for the page a change-of-address link opens when it does not know the user's type. The token is spent, the user is found by id whatever their type, and the change is confirmed under that type: the same write, events and refusals as the type's own `confirm`, with the user answered typed as the union of the types that have an e-mail. Only types with an e-mail make it appear; `send` stays on each type. A type's own `changeEmail.confirm` is unchanged: a token issued to a user of another type is `TOKEN_UNKNOWN` there, and it is spent, so with several types an anonymous page calls the root one. A user type may no longer be named `changeEmail`. The new `AnyTypeChangeEmailApi` types the root method.
