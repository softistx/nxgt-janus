---
'@nxgt/janus-webhooks': minor
'@nxgt/janus-webhooks-redis': minor
---

The change events, from `@nxgt/janus` 0.14: `user.passwordChanged` and `user.emailChanged` are signed, posted and verified like the other eight. An endpoint's `types` may name them, and the Redis queue stores and reads them back. The messages that list the event types — `webhooks: an endpoint's types are user event types — …` and `webhooks: the listener takes a user event — …` — now list ten.

**`user.emailChanged` is posted without its `formerEmail`.** `webhooks()` drops the address `@nxgt/janus` hands its listener before the queue, so no endpoint, queue — yours or the Redis one — or `onGivingUp` report ever holds it. Send the notice to the former address from the `janus({ events })` listener, beside `webhooks()`.

**Upgrade the receiver before the sender.** A receiver's `verifyWebhook` before 0.6.0 answers `null` for the two new types, so their deliveries fail until they are given up. Until every receiver is upgraded, give its endpoint the `types` it knows. **Upgrade `@nxgt/janus-webhooks-redis` with `@nxgt/janus`, too**: a queue before 0.4.0 cannot read back a delivery of a new type, and the claims of that endpoint fail in its processes until they are upgraded.
