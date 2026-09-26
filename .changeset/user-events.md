---
"@nxgt/janus": minor
---

User events: `janus({ events })` hears what happened to a user once it is written.

- `events` is one function, called with a `UserEvent` of type `user.created` (`create`, `signUp`), `user.emailVerified` (`verifyEmail.confirm`, and the link of `resetPassword.confirm` or the code of `signInCode.confirm`, never for an e-mail already verified), `user.passwordReset` (`resetPassword.confirm`) or `user.deleted` (`delete`, once).
- An event names the user by id alone: `{ id, type, occurredAt, userId, userType }`. Its `id` is a UUIDv7 minted for it, which is the key to deliver it once. It carries no login, no e-mail, no field and no secret.
- The listener runs right after the write has landed — before the steps that follow it, so a store outage in those does not lose the event — and is awaited before the flow answers, so a durable queue has the event by then. `occurredAt` is the write's own time. A listener that throws fails no flow: the write happened. The failure is a `JANUS_EVENT_FAILED` warning that names the event type, its id and the user id, never the failure's message.
- `webhooks({ … })` from the coming `@nxgt/janus-webhooks` will sign and deliver the events; any function will do meanwhile.
