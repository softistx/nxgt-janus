---
"@nxgt/janus": minor
"@nxgt/janus-mongo": minor
"@nxgt/janus-drizzle": minor
---

A user record gains an `avatar` slot: `{ id, updatedAt } | null`, patched like `secondFactor` (absent keeps it, a value replaces it whole, `null` removes it). `@nxgt/janus` exports `AvatarRecord`, the app-facing `User` carries `avatar`, `avatar` joins the reserved field names (a schema declaring it is refused), the memory store keeps it, and the conformance suite gains `users.avatarSlot`. `avatar.set` and `avatar.remove` write it (see the operations changeset), and a user nobody has set an avatar for reads `avatar: null`.

A store written for the port must now round-trip `avatar`, and the new case checks it.

- **`@nxgt/janus-mongo`**: run `syncMongoStores(db)` before deploying, since the `users` validator is strict and must admit `avatar`. A document without the field reads as `avatar: null`; no document is rewritten.
- **`@nxgt/janus-drizzle`**: a migration is required. `users` gains the nullable columns `avatar_id` and `avatar_updated_at` and the check `users_avatar_whole` (both or neither); generate it with `drizzle-kit generate`, or apply the SQL in the migrations guide. Deployed before it, queries on `users` fail with `STORE_FAILED`.

**Breaking: `avatar` is now a reserved name.** `avatar` is a reserved field name, and, once `avatar.set` and `avatar.remove` ship (see the operations changeset), a reserved user type name. A schema that declares an `avatar` field no longer compiles, a request carrying one is refused `USER_INVALID`, and the `fields.avatar` already stored for existing users stops being read: `user.avatar` is now janus's own answer. Rename the schema field and move the stored values **before** deploying, and upgrade `@nxgt/janus` and its store adapter in the same deploy (an older adapter returns no avatar slot).

```js
// MongoDB
db.users.updateMany(
  { 'fields.avatar': { $exists: true } },
  { $rename: { 'fields.avatar': 'fields.photoUrl' } },
);
```

```sql
-- PostgreSQL, @nxgt/janus-drizzle: the fields live in the jsonb column "users"."fields"
UPDATE "users"
SET "fields" = ("fields" - 'avatar') || jsonb_build_object('photoUrl', "fields" -> 'avatar')
WHERE jsonb_exists("fields", 'avatar');
```
