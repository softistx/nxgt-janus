---
'@nxgt/janus': minor
---

Two new user events tell you when a user's second factor was turned on or off:

- `user.secondFactorEnabled` is sent by `secondFactor.activate`, once the first code made the factor active. `enroll` sends nothing, because it only leaves the factor waiting.
- `user.secondFactorDisabled` is sent by `secondFactor.disable` when it removed an active factor. A user who had no factor, a factor still waiting for its first code, or a second `disable` sends nothing.

Both follow the other events' rules: the listener runs after the write and is awaited, the event names the user by id alone, a refused call sends nothing, and a listener that throws fails no flow but is reported as a `JANUS_EVENT_FAILED` warning.

`UserEventType` now has six members. A `switch` over `event.type` that ends in a `never` check stops compiling until it handles the two new ones. Upgrade `@nxgt/janus-webhooks` and `@nxgt/janus-webhooks-redis` with this version, and upgrade every webhook receiver before the sender.
