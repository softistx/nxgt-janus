---
'@nxgt/janus': minor
---

**`signInCode.confirm` and `magicLink.confirm` now drop the password and sign out every session when they prove an e-mail never verified before.** Anyone could sign up with somebody else's e-mail and a password of their own; when the address's owner later signed in by code or link, the e-mail turned verified while that password — and the session `signUp` opened — kept working. The first proof now ends both, as `resetPassword.confirm` does:

- In the write that proves the e-mail, the password is removed (`hasPassword` turns `false`). Then every session of the user is revoked, and the reset links and second-factor challenges still waiting are spent — before the new session, or second-factor challenge, is opened.
- `user.emailVerified` is sent, then **`user.passwordChanged` when a password was dropped**, even if an outage interrupts the sign-outs. `@nxgt/janus-mail`'s `passwordChanged` notice, sent on that event, tells the inbox's owner.
- **An e-mail already verified changes nothing**: no write, no sign-out, no event. An e-mail changed by `update` is unverified again, so its first proof by code or link drops the password too.
- **A user who signed up with a password and signs in by code or link before verifying has no password afterwards**: `signIn` answers `CREDENTIALS_INVALID` with `reason: 'noPassword'`. Offer `setPassword` after such a sign-in, or send `verifyEmail` at sign-up.
- A second factor is kept: one someone else activated still gates the sign-in, and `secondFactor.disable` removes it.
- No change to the store port or the conformance suite: `updateUser` with `password: null` and `revokeUserSessions` were already required, and are already tested.

The README trap that told you to sign out everywhere on `user.emailVerified` yourself is replaced; the sign-in link and sign-in code guides, the events guide, troubleshooting (`CREDENTIALS_INVALID`) and `@nxgt/janus-mail`'s docs say what changed.
