---
"@nxgt/janus": patch
---

`@nxgt/janus/conformance`: `deleteUserSessions` may leave a session that lapsed before the call out of its count. A store with its own expiry — a Redis key TTL — drops it as soon as it lapses, which the port already allowed; the suite now accepts 2 as well as 3 in that case.
