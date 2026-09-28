---
'@nxgt/janus-webhooks': minor
'@nxgt/janus-webhooks-redis': minor
---

The recovery codes' events, from `@nxgt/janus` 0.10: `user.recoveryCodesRegenerated` and `user.recoveryCodeUsed` are signed, posted and verified like the other six. An endpoint's `types` may name them, and the Redis queue stores and reads them back. The messages that list the event types — `webhooks: an endpoint's types are user event types — …` and `webhooks: the listener takes a user event — …` — now list eight.

**Upgrade the receiver before the sender.** A receiver's `verifyWebhook` before 0.4.0 answers `null` for the two new types, so their deliveries fail until they are given up. Until every receiver is upgraded, give its endpoint the `types` it knows. **Upgrade `@nxgt/janus-webhooks-redis` with `@nxgt/janus`, too**: a queue before 0.3.0 cannot read back a delivery of a new type.
