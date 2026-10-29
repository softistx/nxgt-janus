---
"@nxgt/janus": minor
---

Verify the e-mail at sign-up without revealing taken addresses (#290). `password.requireVerifiedEmail` refuses a correct password on an unverified address with the new `EMAIL_UNVERIFIED` code (`EmailUnverifiedError`, 403) and opens no session. `signUp.prepare(input)`, on a type whose login is its e-mail, validates the fields and the password policy and counts the attempt per address in the request; its `send()` answers `{ status: 'created', user, issued }` (verification token, no session) or `{ status: 'taken', user }`. `verifyEmail.prepare(email)` counts an anonymous resend per address. `signUp` itself is unchanged. An exhaustive switch over `JanusErrorCode` must now handle `EMAIL_UNVERIFIED`.
