---
'@nxgt/janus-drizzle': minor
---

Implements `SessionStore.reauthenticateSession` — one `update … where revoked_at is null returning` — and admits the token kind `stepUp`.

**A migration is required: the `tokens_kind` check admits `stepUp`.** Run `drizzle-kit generate`, then migrate. It writes one statement, `ALTER TABLE "tokens" DROP CONSTRAINT "tokens_kind", ADD CONSTRAINT "tokens_kind" CHECK (… 'stepUp')`, and rewrites no row. Deployed without it, a step-up request fails with `STORE_FAILED`, caused by `violates check constraint "tokens_kind"`; every other flow keeps working. `sessions` gains no column.
