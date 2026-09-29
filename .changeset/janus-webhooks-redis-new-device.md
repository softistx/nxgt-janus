---
"@nxgt/janus-webhooks-redis": minor
---

Queues `user.newDeviceSignedIn`, `@nxgt/janus-webhooks` 0.7's new type.

- **Breaking in a mixed fleet: a 0.4.x process refuses a `user.newDeviceSignedIn` delivery written by 0.5.0. Upgrade every process, receivers first**, or leave the type out of `webhooks({ types })` until they are.
