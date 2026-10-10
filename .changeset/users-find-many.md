---
'@nxgt/janus': minor
'@nxgt/janus-drizzle': minor
'@nxgt/janus-mongo': minor
'@nxgt/janus-webhooks': patch
---

**`findMany(ids)` on every user type: several users by id, in one query.** `auth.staff.findMany(ids: readonly string[]): Promise<User[]>` answers the users of that type **in the order the ids were given**, each once — a repeated id at its first place. An id `find` answers `null` for — malformed, unknown, or held by a user of another type — is **left out**, never an error, so the answer may be shorter than `ids`: match by `user.id`, never by position. An empty list answers `[]` without reaching the store; any length is read, 100 ids per query, one query after another. A failure is `STORE_FAILED`, never a shorter list; something other than an array is a bare `TypeError`. For a list of rows, where one `find` per row would fill the connection pool.

`@nxgt/janus`: **the users store gains an optional method, `findUsers(ids)`**, the second optional capability after `sessions.deleteExpiredSessions`. It answers the users holding the ids, whatever their type, in any order, and leaves out an id nobody holds; the core calls it with 1 to 100 distinct, well-formed ids. **A store without it keeps working**: `findMany` reads with `findUser` instead, ten at a time. `StoreCapabilities` gains `findUsers`, and `janus()` refuses a `findUsers` that is present but not a function. The reference store implements it. `@nxgt/janus/conformance` gains `users.findUsers`, `users.findUsersNone` and `outage.findUsers`, skipped with their reason for a store that lacks the method; a case's `needs` may now name several things (`['faults', 'findUsers']`), and the new `CaseNeed` type names what it may hold. An adapter that reads `ConformanceCase.needs` as a single string should read it as one or a list. Three new compile-time refusals (155 in all).

`@nxgt/janus-drizzle` and `@nxgt/janus-mongo` implement `users.findUsers` in one statement — `inArray` on the users' id, and `$in` on `_id`. `@nxgt/janus-webhooks`: its copy of the conformance suite's `describeSuite` reads a case needing several things, as `@nxgt/janus`'s does; no change to its suite.
