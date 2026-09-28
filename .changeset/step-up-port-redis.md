---
'@nxgt/janus-redis': minor
---

Implements `SessionStore.reauthenticateSession`: one Lua script that moves `authenticatedAt` only while `revokedAt` is empty, and leaves the expiry and every key's TTL as they were. The token kind `stepUp` needs nothing: the scripts match on whatever kind they are given. No migration.
