---
'@nxgt/janus-drizzle': minor
---

Admits the token kind `magicLink`, `@nxgt/janus` 0.15's sign-in link.

**A migration is required: the `tokens_kind` check admits `magicLink`.** Run `drizzle-kit generate`, then migrate. It writes one statement, `ALTER TABLE "tokens" DROP CONSTRAINT "tokens_kind", ADD CONSTRAINT "tokens_kind" CHECK (… 'magicLink', 'stepUp')`, and rewrites no row. Deployed without it, `magicLink.request` fails with `STORE_FAILED`, caused by `violates check constraint "tokens_kind"`; every other flow keeps working.
