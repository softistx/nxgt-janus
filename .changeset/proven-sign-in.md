---
'@nxgt/janus': minor
'@nxgt/janus-telemetry': minor
---

**Signing in on the application's own proof: `auth.<type>.signInProven(user, { device? })`.** For a user the application proved by its own means — an invitation token it issued and the person followed, a channel of its own — with no password, code or link. It finishes as every sign-in does and answers the same `SignedIn | SecondFactorRequired` union: an active second factor answers a challenge for `secondFactor.confirm`, a `device` answers `newDevice` and `deviceToken` and sends `user.newDeviceSignedIn` for a new one, and an inactive user is `USER_INACTIVE`. A malformed id, an unknown one, a deleted user or a user of another type is `NOT_FOUND`, as for `get`. It sends no e-mail, issues no token, counts in neither the mail nor the sign-in throttle, and spends nothing: links and codes already sent still work. It proves no e-mail.

**Privileged**: janus checks no credential, so call it only after your server verified its proof, with the id from that proof's record — never with an id a request supplied. It replaces `magicLink.request` + `confirm` for accepting an invitation, which since 0.18 counted against the mail throttle per address: five anonymous requests for the invitee's address made the acceptance answer 429. `@nxgt/janus`: new type `ProvenSignInApi<U, Answer>`, on every user type; three new compile-time refusals (163 in all).

`@nxgt/janus-telemetry`: `signInProven` is traced as `janus.<type>.signInProven` with `janus.signIn.status`, and writes `janus.signIn`, `janus.signIn.refused` or `janus.signIn.secondFactor` like the other sign-ins, marked `janus.signIn.proven: true`. Needs `@nxgt/janus` 0.20 for the new flow.
