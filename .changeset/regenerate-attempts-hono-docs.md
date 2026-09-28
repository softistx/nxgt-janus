---
'@nxgt/janus-hono': patch
---

Docs: the regenerate route needs no limiter of its own any more — `@nxgt/janus` counts five attempts per user per 15-minute window, and `janusErrors()` answers a wrong code `401 {"code":"CODE_INVALID","attemptsLeft":<n>}`, with `attemptsLeft: 0` once the window is spent.
