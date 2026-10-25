---
"@nxgt/janus": minor
"@nxgt/janus-webhooks": minor
"@nxgt/janus-webhooks-redis": minor
"@nxgt/janus-telemetry": minor
"@nxgt/janus-hono": patch
---

Write a user's avatar: `auth.<type>.avatar.set(user, { id }, { ifVersion? })` and `avatar.remove(user, { ifVersion? })` (on the root, `auth.avatar.set`, with several user types, finding the type from the user's record). Janus stores only the id your application chose; upload the image to your own storage first, under a fresh id such as `crypto.randomUUID()`, then call `set`. The user comes back with `user.avatar`.

- `set` refuses an id that is not a non-empty string of at most 512 characters with the new `AVATAR_ID_INVALID` (400, `AvatarIdInvalidError`), before reading anything. Setting the id the user already has, or removing an absent avatar, writes and sends nothing.
- Two new user events, `user.avatarChanged` and `user.avatarRemoved`, carry `formerAvatarId`: the id of the image the write let go, which is how your listener deletes it from storage. `UserEventType` gains both, so a `switch` on `event.type` that was exhaustive needs two cases. `formerAvatarId` stays in the process that wrote the event, as `formerEmail` does.
- `avatar` can no longer name a user type (a compile error, and a `TypeError` for a JavaScript caller).
- These are server-side methods with no access or freshness check, like `update`: whether a request may change an avatar is the application's to decide.

**`@nxgt/janus-webhooks`** and **`@nxgt/janus-webhooks-redis`** accept the two new event types (`webhooks({ endpoints })` posts them to endpoints whose `types` include them, all of them when `types` is absent, and a queue reads them back). **Upgrade every receiver's `@nxgt/janus-webhooks` before the sender**: an older `verifyWebhook` answers `null` for a type it does not know, and a 0.5.x queue process fails a claim of one with `STORE_FAILED`. Give an endpoint the `types` it knows until then.

**`@nxgt/janus-telemetry`** writes `janus.avatar.set` and `janus.avatar.removed` with the `user.id` and `janus.user.type` (the root form's too), never the avatar id.

**`@nxgt/janus-hono`** only recognises the new `AVATAR_ID_INVALID` code in its tests and docs: it answers 400 `{ code }`.
