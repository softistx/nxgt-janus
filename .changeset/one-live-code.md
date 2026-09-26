---
"@nxgt/janus": minor
"@nxgt/janus-drizzle": minor
"@nxgt/janus-mongo": minor
"@nxgt/janus-redis": minor
"@nxgt/janus-telemetry": patch
---

At most one sign-in code live per user, and challenges that end when they should.

- **At most one sign-in code is live per user.** `signInCode.request` issues its code, then spends every other challenge of that user, so only the code in the last e-mail works and an earlier one answers `TOKEN_SPENT`. Requests that race cannot each keep a code: at most one survives. Rate-limit `request` per address, because every call sends an e-mail and cancels the code before it.
- **Writing a password ends the sign-ins left waiting on a second factor.** `resetPassword.confirm`, `setPassword` and `changePassword` spend every open `secondFactor` challenge of the user, so whoever had the old password cannot finish a sign-in they started with it.
- **A sign-in that is still running when the password is written is refused.** `signIn` reads the user again once it has answered. If the password it verified is no longer theirs, it revokes the session it opened, or spends its challenge, and throws `CREDENTIALS_INVALID`. A hash rewritten for the same password is not a change.
- **Another user type's `confirm` spends a challenge at its fifth attempt**, as a fifth wrong code does. This applies to `secondFactor.confirm` and `signInCode.confirm`. Calls after that answer `TOKEN_SPENT`, where they used to answer `CODE_INVALID` with `attemptsLeft: 0`.
- **`verifyEmail.confirm` and `resetPassword.confirm` check the e-mail again on the record they write.** An address changed while the link was being redeemed answers `TOKEN_STALE`, and nothing is written.
- **`SecondFactorRequired` carries `userId`**, for your logs and rate limits. Answer the visitor the challenge alone.
- **For adapter authors:** `TokenStore` gains `spendUserTokens(userId, kind, at, except?)`. It spends the unspent tokens of one user and one kind, except the one whose hash is `except`, and answers how many. It never spends a token that a racing `consumeToken` also spends. The conformance suite has four new cases (49 in all), including its outage case. `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and `@nxgt/janus-redis` implement it, with no migration, sync or new Redis command. The port also now states something the core relies on: a read sees every write that completed before it, so never read from a secondary or a read replica. No suite can check this.
- **janus-telemetry:** `janus.signIn.secondFactor` carries the `user.id` of the user asked for a code.
