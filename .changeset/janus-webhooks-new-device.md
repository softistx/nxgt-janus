---
"@nxgt/janus-webhooks": minor
---

Posts `user.newDeviceSignedIn`, janus 0.17's eleventh event type — without its `sessionId`, as `user.emailChanged` is posted without its `formerEmail`. `EVENT_TYPES` and the conformance suite's queue case list it.

- **Breaking for a receiver built on 0.6.x: it refuses the new type. Upgrade receivers first**, then senders; or leave `user.newDeviceSignedIn` out of `webhooks({ types })` until every receiver is on 0.7.
- **Breaking for an exhaustive `switch` over the posted event's `type`.**
