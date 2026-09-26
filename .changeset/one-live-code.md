---
"@nxgt/janus": minor
"@nxgt/janus-drizzle": minor
"@nxgt/janus-mongo": minor
"@nxgt/janus-redis": minor
"@nxgt/janus-telemetry": patch
---

One sign-in code live per user, and challenges that end when they should.

- **One sign-in code is live per user.** `signInCode.request` spends the challenges sent to that user before it, so only the code in the last e-mail works: an earlier one answers `TOKEN_SPENT`, and guesses never run against two challenges at once. Keep rate-limiting `request`, since every call still sends an e-mail.
- **A password reset ends the sign-ins left waiting on a second factor.** `resetPassword.confirm` spends every open `secondFactor` challenge of the user, so whoever had the old password cannot finish a sign-in they started with it.
- **Another user type's `confirm` spends a challenge at its fifth attempt**, as a fifth wrong code does. This applies to `secondFactor.confirm` and `signInCode.confirm`. Calls after that answer `TOKEN_SPENT`, where they used to answer `CODE_INVALID` with `attemptsLeft: 0`.
- **`verifyEmail.confirm` and `resetPassword.confirm` check the e-mail again on the record they write.** An address changed while the link was being redeemed answers `TOKEN_STALE`, and nothing is written.
- **`SecondFactorRequired` carries `userId`**, for your logs and rate limits. Answer the visitor the challenge alone.
- **For adapter authors:** `TokenStore` gains `spendUserTokens(userId, kind, at)`. It spends the unspent tokens of one user and one kind, answers how many, and never spends a token that a racing `consumeToken` also spends. The conformance suite has three new cases (48 in all), including its outage case. `@nxgt/janus-drizzle`, `@nxgt/janus-mongo` and `@nxgt/janus-redis` implement it, with no migration, sync or new Redis command.
- **janus-telemetry:** `janus.signIn.secondFactor` carries the `user.id` of the user asked for a code.
