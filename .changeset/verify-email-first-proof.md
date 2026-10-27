---
"@nxgt/janus": minor
---

`verifyEmail.confirm(token, { firstProof: true })` makes the verification link a first proof of the address, on a type and at the root of several: for an e-mail never proved it drops the password and the second factor set before the proof, revokes every session and spends the reset links and challenges, as `magicLink.confirm`, `signInCode.confirm` and `verifyEmail.proveFirst` do, so someone who signed up with an address they do not own no longer keeps access once its holder follows the link. It sends `user.emailVerified`, then `user.passwordChanged` and `user.secondFactorDisabled` when they apply. An already proved address is confirmed as before. Without the option nothing changes (opt-in); `VerifyEmailOptions` is exported as a type.
