---
'@nxgt/janus': minor
---

**`signInCode.confirm` and `magicLink.confirm` now remove the second factor too when they prove an e-mail never verified before.** Anyone could sign up with somebody else's e-mail, then enrol and activate a second factor on their own phone; when the address's owner later signed in by code or link, the password was dropped but the factor stayed, so the owner was asked for a code they could never produce. The write that proves the e-mail now drops the second factor with the password:

- The factor is removed whether active or still waiting for its first code, with its recovery codes (`hasSecondFactor` turns `false`, `secondFactor.recoveryCodesLeft` answers `null`) — the same write `secondFactor.disable` makes. The owner's sign-in answers a session, not a challenge, and a challenge left waiting was already spent.
- **`user.secondFactorDisabled` is sent when an active factor was removed**, after `user.emailVerified` and `user.passwordChanged`, from the same `finally` — so an outage in the sign-outs after the write still reports it. `@nxgt/janus-mail`'s `twoFactorDisabled` notice, sent on that event, tells the inbox's owner. A factor still waiting was never asked for, and sends nothing, as for `disable`.
- **An e-mail already verified changes nothing**: the factor is kept and `confirm` answers a challenge, as `signIn` does.
- **A user who enrolled a factor before proving their own e-mail loses it on their first sign-in by code or link**: the library cannot tell them from someone who registered their address. Send `verifyEmail` before offering `secondFactor.enroll`.
- No change to the store port or the conformance suite: `updateUser` with `secondFactor: null` was already required, and is already tested.

The README (sign-in codes, sign-in links, second factor, events and the trap that said the factor was kept), the sign-in link, sign-in code, second factor and events guides, troubleshooting (`SECOND_FACTOR_NOT_ENROLLED`, `CREDENTIALS_INVALID`) and the roadmap say what changed.
