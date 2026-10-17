---
'@nxgt/janus-drizzle': minor
---

Implements `tokens.deleteExpiredTokens`, so `auth.collectExpired()` now deletes lapsed one-time tokens as well as lapsed sessions: one `delete … where expires_at <= … returning`, spent or not, of any kind and user, the sign-in and mail throttles' counts included. PostgreSQL has no TTL, so those rows, one per login tried and per window, stayed for ever. A token that has not lapsed is never deleted.

A migration is recommended: `tokens` gains an index on `expires_at`, and drizzle-kit writes one statement, `CREATE INDEX "tokens_expires_at" ON "tokens" ("expires_at");`. The adapter runs without it, but then every collection scans the table. If you made an index on `tokens (expires_at)` by hand, as the earlier docs advised, drop it in the same migration (PostgreSQL named it `tokens_expires_at_idx`), or the column keeps two. `CREATE INDEX` blocks writes while it builds, and the first `collectExpired()` deletes the whole backlog in one statement, so run both off-peak. [To 0.9](https://github.com/softistx/nxgt-janus/blob/develop/packages/janus-drizzle/docs/guide/migrations.md#to-09-an-index-on-tokensexpires_at) has the details.

After a collection, a lapsed link answers `TOKEN_UNKNOWN` instead of `TOKEN_EXPIRED`. Needs `@nxgt/janus` 0.25 to be called; on an earlier core the method is never called.
