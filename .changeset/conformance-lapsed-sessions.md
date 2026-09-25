---
"@nxgt/janus": patch
---

`@nxgt/janus/conformance`: `sessions.deleteUser` asks the store first whether it still holds the session that lapsed, and expects `deleteUserSessions` to count it only then — 3, or 2 when the store already expired it. A store with its own expiry, a Redis key TTL, drops a lapsed session as soon as it lapses, which the port already allowed. A store that holds it and miscounts still fails.
