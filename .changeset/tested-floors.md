---
"@nxgt/janus": patch
"@nxgt/janus-drizzle": patch
"@nxgt/janus-redis": patch
"@nxgt/janus-webhooks-redis": patch
---

Docs: the minimum server versions the READMEs promise are now tested on every CI run, and the docs say so. `@nxgt/janus-drizzle` passes both conformance suites on PostgreSQL 15 as well as 17, over each driver; `@nxgt/janus-redis` and `@nxgt/janus-webhooks-redis` pass theirs on Redis 7.0 and Valkey 7.2 as well as Redis 7.4. The adapters guide of `@nxgt/janus` lists the same versions.
