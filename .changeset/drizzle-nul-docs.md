---
"@nxgt/janus-drizzle": patch
---

The docs no longer tell you to refuse a NUL character in your schema: `@nxgt/janus` refuses it, and a lone surrogate, before any store is asked, so PostgreSQL never sees one and `STORE_FAILED` is no longer the answer.
