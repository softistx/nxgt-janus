---
'@nxgt/janus-webhooks': minor
---

A secret holds at most 64 bytes, the ceiling the Standard Webhooks specification sets (24 to 64 bytes). `webhooks()` and `verifyWebhook()` now refuse a longer `whsec_` secret with `TypeError: <call>: a secret holds at most 64 bytes of base64 after whsec_ — make one with mintWebhookSecret()`.

**Breaking: a secret of more than 64 bytes, accepted until now, is refused on upgrade.** Secrets from `mintWebhookSecret()` hold 32 bytes and are unaffected. With a longer one, rotate away from it before upgrading, on the version you run: mint a new one, sign with both (`secrets: [old, next]`), let the receiver accept both, drop the old one from the sender and then from the receiver, and upgrade.
