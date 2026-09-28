---
'@nxgt/janus': minor
---

The store port gains what a step-up needs — a signed-in user confirming a sensitive action. No flow uses it yet: `stepUp.request` and `stepUp.confirm` come next.

- **Breaking for an adapter: `SessionStore.reauthenticateSession(id, at)` is a new required method.** It moves a standing session's `authenticatedAt` to `at`, in one conditional write, and answers the record as written; `null` for no session or a revoked one, which it never brings back. `janus()` refuses a store without it at wiring: `store.sessions has no method reauthenticateSession`.
- **Breaking for an exhaustive `switch`: `TokenKind` gains `'stepUp'`**, the challenge of a step-up — a kind of its own, so a sign-in code never confirms an action nor an action's code signs anyone in. A store that lists the kinds — a `CHECK`, a validator's enum — adds it.
- The conformance suite has 54 cases, five of them new: `sessions.reauthenticate`, `sessions.reauthenticateRace` (a confirmation racing a revocation never brings the session back), `tokens.everyKind` (a token of every kind stored, counted and spent), `tokens.stepUpKind`, and `outage.reauthenticateSession`.
