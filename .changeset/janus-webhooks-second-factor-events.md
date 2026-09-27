---
'@nxgt/janus-webhooks': minor
'@nxgt/janus-webhooks-redis': minor
---

`user.secondFactorEnabled` and `user.secondFactorDisabled`, the new user events of `@nxgt/janus`, are now delivered and verified like the other four:

- `webhooks()` signs and posts them, and an endpoint's `types` may name them. An endpoint with no `types` receives them from now on.
- `verifyWebhook` accepts them.
- `createRedisWebhookQueue` writes them and reads them back.
- The queue conformance suite round-trips all six types.

A receiver on an earlier `@nxgt/janus-webhooks` answers `null` for these two types, so upgrade receivers first. Until you do, give their endpoints the four `types` they know.
