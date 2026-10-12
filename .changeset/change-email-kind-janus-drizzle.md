---
'@nxgt/janus-drizzle': minor
---

The `tokens_kind` check admits `changeEmail`, the token kind of `@nxgt/janus`'s change of e-mail. **A migration is required**: run `drizzle-kit generate`, then `drizzle-kit migrate`, before deploying — one statement, `ALTER TABLE "tokens" DROP CONSTRAINT "tokens_kind", ADD CONSTRAINT "tokens_kind" CHECK (… 'changeEmail')`, rewriting no row. Until it has run, the first write of a `changeEmail` token fails with `STORE_FAILED`; every other flow keeps working.
