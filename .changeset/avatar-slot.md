---
"@nxgt/janus": minor
"@nxgt/janus-mongo": minor
"@nxgt/janus-drizzle": minor
---

A user record gains an `avatar` slot: `{ id, updatedAt } | null`, patched like `secondFactor` (absent keeps it, a value replaces it whole, `null` removes it). `@nxgt/janus` exports `AvatarRecord`, the app-facing `User` carries `avatar`, `avatar` joins the reserved field names (a schema declaring it is refused), the memory store keeps it, and the conformance suite gains `users.avatarSlot`. **Nothing writes the slot yet**: the operations that set and remove an avatar land in a later minor, so every user reads `avatar: null` until then.

A store written for the port must now round-trip `avatar`, and the new case checks it.

- **`@nxgt/janus-mongo`**: run `syncMongoStores(db)` before deploying, since the `users` validator is strict and must admit `avatar`. A document without the field reads as `avatar: null`; no document is rewritten.
- **`@nxgt/janus-drizzle`**: a migration is required. `users` gains the nullable columns `avatar_id` and `avatar_updated_at` and the check `users_avatar_whole` (both or neither); generate it with `drizzle-kit generate`, or apply the SQL in the migrations guide. Deployed before it, queries on `users` fail with `STORE_FAILED`.
