---
'@nxgt/janus': minor
'@nxgt/janus-telemetry': minor
'@nxgt/janus-hono': patch
'@nxgt/janus-graphql': patch
---

**E-mail requests in two steps: `prepare`, then `send()`.** `magicLink.prepare(email)`, `signInCode.prepare(email)` and `resetPassword.prepare(email)` validate the input as `request` does, normalise the address and count it against the mail throttle — `MailThrottledError` (`MAIL_THROTTLED`, `retryAfter`) past the limit — and **look nobody up**: the same store calls for any address, none with `mail: { throttle: false }`. `send()` on the answer does the rest of `request` — the lookup, the token issued, the earlier ones spent — and answers what `request` answers, `null` for nobody, **without counting again**. It runs once: a second call, or one after a `send()` that failed, is a `TypeError` (`magicLink.prepare(…).send: already called — a prepared request sends once; call magicLink.prepare again for another`), so each `prepare` permits exactly one issue and nothing a caller passes skips the count. An application that runs `request` in the background, so its time does not tell an account from nobody, can now answer `MAIL_THROTTLED` in the visitor's request and send in the background.

`@nxgt/janus`: `signInCode.prepare` also answers the `challenge`, minted before the lookup, so the visitor's cookie is set whoever holds the address and no decoy is needed; `send()` issues the code under it. New types `PreparedRequest<Issued>` (`{ send() }`, for a link and a reset) and `PreparedCode<U>` (`{ challenge, send() }`). `request(email)` is unchanged; it is now `prepare`, then `send()`. `verifyEmail.send` and `stepUp.request` have no `prepare`: they are counted per user, for a user the application already holds, so their time tells nothing about who has an account. Five new compile-time refusals (160 in all).

`@nxgt/janus-telemetry`: `prepare` is traced like any flow and writes `janus.mail.throttled` (`janus.mail.flow: magicLink.prepare`) past its limit; the `send()` of what it answers is traced as `janus.<type>.magicLink.prepare.send` and writes `janus.magicLink.sent` or `janus.signInCode.sent`, as `request` does. Needs `@nxgt/janus` 0.20 for the new flows.

`@nxgt/janus-hono` and `@nxgt/janus-graphql`: docs only — the routes guide's code, link and reset routes, and the errors guide's mutation, use `prepare` in the request and `send()` after the answer.
