---
'@nxgt/janus': minor
---

`changePassword` now counts in the sign-in throttle of the user's login, the one `signIn` counts in, so a caller holding a session can no longer try current passwords without limit. Each call is one more password tried at the login, counted before `current` is compared (a user with no password included, so the answer does not tell them apart), and past the limit (ten per 15 minutes by default) it answers `CREDENTIALS_INVALID` with `reason: 'throttled'` and `retryAfter`, the right current password included, comparing and writing nothing. A change that is written restarts the count, as a sign-in that opens a session does. A user with no login string, or `signIn: { throttle: false }`, counts nothing; a store that cannot count throws `STORE_FAILED`.

For an application: the budget is one per account, so wrong current passwords now count toward the login's sign-in throttle and can make `signIn` answer `throttled`, and wrong sign-ins can make `changePassword` answer it. Answer `changePassword`'s `CREDENTIALS_INVALID` with `retryAfter` as you do `signIn`'s. A test that tries more than ten wrong current passwords over a `fixedClock` is throttled: advance the clock, or wire `signIn: { throttle: false }`.
