---
'@nxgt/janus-hono': patch
---

Docs: the routes guide shows the recovery codes of `@nxgt/janus` 0.10 — the activation route answering the codes once, a route regenerating them on a fresh code from the app, and a sign-in route redeeming the challenge with a recovery code, which `janusErrors()` answers as `confirm`'s, plus `VERSION_CONFLICT` (409) for a code used twice at once.
