---
'@nxgt/janus': minor
---

**Behaviour change: `secondFactor.regenerateRecoveryCodes` counts its attempts.** Its code from the app was the only thing between a stolen session and new recovery codes, and nothing bounded the guesses. It now takes five attempts per user per 15-minute window — the same five a challenge takes — counted by the store before the code is compared, so every process over the same store shares the count.

- A code that does not match is `CODE_INVALID` with `attemptsLeft`: what the window has left. It carried none before.
- Past the fifth, every call in the window is `CODE_INVALID` with `attemptsLeft: 0` — **the right code included**, compared by nobody — and writes nothing: `secondFactor.regenerateRecoveryCodes: too many codes tried — wait for the next 15-minute window`. Tell the user to wait; `attemptsLeft: 0` also comes with the fifth wrong code, after which the next call is this refusal.
- A code accepted — a regenerate, or a sign-in finished with the app — starts the count again. A password written does not.
- The same code tried twice at once regenerates once; the other call is `VERSION_CONFLICT`. A store that fails throws `STORE_FAILED`, never a refusal.

No port change: the count is a one-time token of kind `secondFactor`, counted by `TokenStore.countAttempt`, whose secret is a keyed hash nobody is given — it cannot be redeemed as a challenge. No adapter or migration to update.
